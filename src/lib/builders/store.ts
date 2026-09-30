import 'server-only';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Address, Hex } from 'viem';

import { BUILDER_CHALLENGE_TTL_MS, builderVerificationMessage } from './verification';

const DB_PATH = process.env.BUILDER_DB_PATH ?? './data/builders.db';
let database: DatabaseSync | null = null;

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
  `);
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
    challengeId: id, nonce, chainId: input.chainId, tokenId: input.tokenId,
    owner: input.owner, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString(),
  });
  db().prepare(`INSERT INTO builder_challenges
    (id,nonce_hash,message,chain_id,token_id,owner_address,expires_at)
    VALUES (?,?,?,?,?,?,?)`).run(
    id, hash(nonce), message, input.chainId, input.tokenId, input.owner.toLowerCase(), expiresAt.toISOString(),
  );
  return { id, message, expiresAt: expiresAt.toISOString() };
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
