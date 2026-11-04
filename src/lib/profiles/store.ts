import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

import { siteUrl } from '@/lib/site';

import { EMPTY_PROFILE, type Profile, type ProfileContent } from './model';

const DB_PATH = process.env.PROFILE_DB_PATH ?? './data/profiles.db';

/**
 * One self-provided profile per wallet, with the signature that set it,
 * and the pictures builders uploaded for them.
 *
 * Its own file because nothing in it is evidence: keeping it out of the
 * stores Pokter's measurements live in means no query over those can pick
 * up a bio by accident. Pictures sit beside the profiles, keyed by the
 * hash of their bytes, so the same image uploaded twice is stored once.
 */
export class ProfileStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS profiles (
        wallet TEXT PRIMARY KEY,
        handle TEXT,
        content TEXT NOT NULL,
        signed_at TEXT NOT NULL,
        signature TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS profiles_handle ON profiles (handle) WHERE handle IS NOT NULL;
      CREATE TABLE IF NOT EXISTS avatars (
        id TEXT PRIMARY KEY,
        mime TEXT NOT NULL,
        bytes BLOB NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profile_challenges (
        id TEXT PRIMARY KEY,
        wallet TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        suffix TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT
      );
    `);
  }

  createChallenge(wallet: string, chainId: number): { id: string; suffix: string; expiresAt: string } {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const suffix = `\nPokter domain: ${new URL(siteUrl()).host}\nProfile challenge: ${id}\nNonce: ${randomBytes(24).toString('base64url')}\nExpires: ${expiresAt}`;
    this.db.prepare('INSERT INTO profile_challenges (id, wallet, chain_id, suffix, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, wallet.toLowerCase(), chainId, suffix, expiresAt);
    return { id, suffix, expiresAt };
  }

  challenge(id: string, wallet: string, chainId: number): string | null {
    const row = this.db.prepare('SELECT suffix FROM profile_challenges WHERE id = ? AND wallet = ? AND chain_id = ? AND consumed_at IS NULL AND expires_at > ?')
      .get(id, wallet.toLowerCase(), chainId, new Date().toISOString()) as { suffix: string } | undefined;
    return row?.suffix ?? null;
  }

  consumeChallenge(id: string): boolean {
    return this.db.prepare('UPDATE profile_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND expires_at > ?')
      .run(new Date().toISOString(), id, new Date().toISOString()).changes === 1;
  }

  private static toProfile(row: Record<string, string | null>): Profile {
    /* Content is stored as signed; fields added later default to their empty value. */
    return { ...EMPTY_PROFILE, ...(JSON.parse(row.content!) as Partial<ProfileContent>), wallet: row.wallet!, signedAt: row.signed_at!, signature: row.signature! };
  }

  get(wallet: string): Profile | null {
    const row = this.db.prepare('SELECT * FROM profiles WHERE wallet = ?').get(wallet.toLowerCase());
    return row ? ProfileStore.toProfile(row as Record<string, string | null>) : null;
  }

  byHandle(handle: string): Profile | null {
    const row = this.db.prepare('SELECT * FROM profiles WHERE handle = ?').get(handle.toLowerCase());
    return row ? ProfileStore.toProfile(row as Record<string, string | null>) : null;
  }

  /** Every profile's wallet, when it was last signed and whether it has a handle. For the operator's counts only. */
  signers(): Array<{ wallet: string; signedAt: string; handle: boolean }> {
    return (this.db.prepare('SELECT wallet, signed_at, handle FROM profiles').all() as Array<{ wallet: string; signed_at: string; handle: string | null }>).map((row) => ({
      wallet: row.wallet,
      signedAt: row.signed_at,
      handle: Boolean(row.handle),
    }));
  }

  /** Whether another wallet already holds this handle. */
  handleTaken(handle: string, wallet: string): boolean {
    if (!handle) return false;
    const holder = this.byHandle(handle);
    return Boolean(holder && holder.wallet !== wallet.toLowerCase());
  }

  put(profile: Profile): void {
    const { wallet, signedAt, signature, ...content } = profile;
    this.db
      .prepare(
        `INSERT INTO profiles (wallet, handle, content, signed_at, signature) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (wallet) DO UPDATE SET handle = excluded.handle, content = excluded.content, signed_at = excluded.signed_at, signature = excluded.signature`,
      )
      .run(wallet.toLowerCase(), content.handle || null, JSON.stringify(content), signedAt, signature);
  }

  remove(wallet: string): void {
    this.db.prepare('DELETE FROM profiles WHERE wallet = ?').run(wallet.toLowerCase());
  }

  putAvatar(id: string, mime: string, bytes: Uint8Array): void {
    this.db.prepare('INSERT OR IGNORE INTO avatars (id, mime, bytes, created_at) VALUES (?, ?, ?, ?)').run(id, mime, bytes, new Date().toISOString());
  }

  avatar(id: string): { mime: string; bytes: Uint8Array } | null {
    const row = this.db.prepare('SELECT mime, bytes FROM avatars WHERE id = ?').get(id) as { mime: string; bytes: Uint8Array } | undefined;
    return row ?? null;
  }
}

let store: ProfileStore | null = null;
export function getProfileStore(): ProfileStore {
  store ??= new ProfileStore(DB_PATH);
  return store;
}
