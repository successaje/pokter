import 'server-only';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getAddress, type Address, type Hex } from 'viem';

import { siteUrl } from '@/lib/site';
import { BUILDER_CHALLENGE_TTL_MS, builderVerificationMessage } from './verification';
import {
  countLiveAutomationTokens,
  ensureAutomationTokens,
  insertAutomationToken,
  listAutomationTokens,
  liveAutomationToken,
  revokeAutomationToken,
  touchAutomationToken,
  type AutomationTokenRecord,
  type AutomationTokenWrite,
} from './automation-store';

const DB_PATH = process.env.BUILDER_DB_PATH ?? './data/builders.db';
let database: DatabaseSync | null = null;

export interface VerifiedPublisherIdentity {
  owner: Address;
  chainId: number;
  tokenId: string;
  verifiedAt: string;
}

function db(): DatabaseSync {
  if (database) return database;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  database = new DatabaseSync(DB_PATH);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS builder_challenges (
      id TEXT PRIMARY KEY,
      nonce_hash TEXT NOT NULL,
      message TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      token_id TEXT NOT NULL,
      owner_address TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS verified_publishers (
      owner_address TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      token_id TEXT NOT NULL,
      signature TEXT NOT NULL,
      verified_at TEXT NOT NULL,
      PRIMARY KEY (chain_id, token_id)
    );
    CREATE INDEX IF NOT EXISTS idx_verified_publishers_owner
      ON verified_publishers (owner_address, verified_at DESC);
    CREATE TABLE IF NOT EXISTS builder_sessions (
      token_hash TEXT PRIMARY KEY,
      owner_address TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_builder_sessions_owner
      ON builder_sessions (owner_address, expires_at DESC);
  `);
  /* Automation tokens live beside the sessions that mint them, in one
     connection: two `DatabaseSync` handles on one WAL file is a hazard
     worth not having for the sake of a separate module's tidiness. */
  ensureAutomationTokens(database);
  return database;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createBuilderChallenge(input: { chainId: number; tokenId: string; owner: Address }) {
  const id = randomUUID();
  const nonce = randomBytes(24).toString('base64url');
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + BUILDER_CHALLENGE_TTL_MS);
  const message = builderVerificationMessage({
    domain: new URL(siteUrl()).host,
    challengeId: id, nonce, chainId: input.chainId, tokenId: input.tokenId,
    owner: input.owner, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString(),
  });
  db().prepare(`INSERT INTO builder_challenges
    (id,nonce_hash,message,chain_id,token_id,owner_address,expires_at)
    VALUES (?,?,?,?,?,?,?)`).run(
    id, hash(nonce), message, input.chainId, input.tokenId, input.owner.toLowerCase(), expiresAt.toISOString(),
  );
  /* The owner rides along so a caller can say "this is not your wallet"
     before asking for a signature that would be rejected anyway. It is
     public: the message it is taken from already names it. */
  return { id, message, owner: input.owner, expiresAt: expiresAt.toISOString() };
}

export function readBuilderChallenge(id: string) {
  const row = db().prepare(`SELECT * FROM builder_challenges
    WHERE id=? AND consumed_at IS NULL AND expires_at>?`).get(id, new Date().toISOString()) as Record<string, string | number> | undefined;
  if (!row) return null;
  return {
    message: String(row.message), chainId: Number(row.chain_id), tokenId: String(row.token_id),
    owner: String(row.owner_address) as Address,
  };
}

export function consumeBuilderChallenge(id: string): boolean {
  return db().prepare(`UPDATE builder_challenges SET consumed_at=?
    WHERE id=? AND consumed_at IS NULL AND expires_at>?`).run(
    new Date().toISOString(), id, new Date().toISOString(),
  ).changes === 1;
}

export function saveVerifiedPublisher(input: {
  owner: Address; chainId: number; tokenId: string; signature: Hex;
}) {
  const verifiedAt = new Date().toISOString();
  db().prepare(`INSERT INTO verified_publishers
    (owner_address,chain_id,token_id,signature,verified_at) VALUES (?,?,?,?,?)
    ON CONFLICT(chain_id,token_id) DO UPDATE SET
      owner_address=excluded.owner_address, signature=excluded.signature, verified_at=excluded.verified_at`).run(
    input.owner.toLowerCase(), input.chainId, input.tokenId, input.signature, verifiedAt,
  );
  return { owner: input.owner, chainId: input.chainId, tokenId: input.tokenId, verifiedAt };
}

export function verifiedPublisherByOwner(owner: Address): VerifiedPublisherIdentity[] {
  const rows = db().prepare(`SELECT owner_address,chain_id,token_id,verified_at
    FROM verified_publishers WHERE owner_address=? ORDER BY verified_at DESC`).all(
    owner.toLowerCase(),
  ) as unknown as Array<Record<string, string | number>>;
  return rows.map((row) => ({
    owner, chainId: Number(row.chain_id), tokenId: String(row.token_id), verifiedAt: String(row.verified_at),
  }));
}

export const BUILDER_SESSION_COOKIE = 'pokter_builder_session';

/**
 * How long a proved ownership lasts before it must be proved again.
 *
 * Twelve hours meant a builder who looked at their own agent once a day
 * signed a challenge every single time — and the thing the session
 * protects is a read: jobs, deliveries and the profile editor for an
 * identity whose ownership is public on chain anyway. The signature
 * stops somebody else managing your agent; it was also stopping you.
 *
 * A week is the ordinary choice for a tool somebody returns to. Writes
 * are unaffected, because every one of them is a wallet transaction the
 * owner signs at the time, so a stale session cannot move anything.
 */
export const BUILDER_SESSION_SECONDS = 7 * 24 * 60 * 60;

export function createBuilderSession(owner: Address): string {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  db().prepare(`INSERT INTO builder_sessions
    (token_hash,owner_address,expires_at,created_at) VALUES (?,?,?,?)`).run(
    hash(token), owner.toLowerCase(), new Date(now.getTime() + BUILDER_SESSION_SECONDS * 1000).toISOString(), now.toISOString(),
  );
  return token;
}

export function builderSessionOwner(token: string | undefined): Address | null {
  if (!token) return null;
  const row = db().prepare(`SELECT owner_address FROM builder_sessions
    WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?`).get(
    hash(token), new Date().toISOString(),
  ) as { owner_address: string } | undefined;
  if (!row) return null;
  try { return getAddress(row.owner_address); } catch { return null; }
}

export function revokeBuilderSession(token: string | undefined): void {
  if (!token) return;
  db().prepare('UPDATE builder_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL').run(
    new Date().toISOString(), hash(token),
  );
}

/*
 * Automation tokens, bound to this process's database.
 *
 * The statements themselves are in `automation-store.ts` so a test can run
 * them against a temp file; these only supply the connection and the clock.
 */

export function saveAutomationToken(write: AutomationTokenWrite): void {
  insertAutomationToken(db(), write);
}

/**
 * The live token for this secret, or null — revoked, expired and unknown
 * are one answer here on purpose. Which it was is not something to tell a
 * caller holding a credential we do not recognise.
 */
export function automationTokenFor(tokenHash: string): AutomationTokenRecord | null {
  return liveAutomationToken(db(), tokenHash, new Date().toISOString());
}

export function automationTokensOf(owner: string): AutomationTokenRecord[] {
  return listAutomationTokens(db(), owner.toLowerCase());
}

export function liveAutomationTokenCount(owner: string): number {
  return countLiveAutomationTokens(db(), owner.toLowerCase(), new Date().toISOString());
}

export function revokeAutomationTokenFor(owner: string, id: string): boolean {
  return revokeAutomationToken(db(), owner.toLowerCase(), id, new Date().toISOString());
}

export function noteAutomationTokenUse(tokenHash: string): void {
  touchAutomationToken(db(), tokenHash, new Date().toISOString());
}
