import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Category } from '@/lib/agents/categories';
import type { Profile } from './model';

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
class ProfileStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS profiles (
        wallet TEXT PRIMARY KEY,
        handle TEXT,
        display_name TEXT NOT NULL,
        bio TEXT NOT NULL,
        avatar TEXT NOT NULL,
        tags TEXT NOT NULL,
        links TEXT NOT NULL,
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
    `);
  }

  private static toProfile(row: Record<string, string | null>): Profile {
    return {
      wallet: row.wallet!,
      handle: row.handle ?? '',
      displayName: row.display_name!,
      bio: row.bio!,
      avatar: row.avatar!,
      tags: JSON.parse(row.tags!) as Category[],
      links: JSON.parse(row.links!) as string[],
      signedAt: row.signed_at!,
      signature: row.signature!,
    };
  }

  get(wallet: string): Profile | null {
    const row = this.db.prepare('SELECT * FROM profiles WHERE wallet = ?').get(wallet.toLowerCase());
    return row ? ProfileStore.toProfile(row as Record<string, string | null>) : null;
  }

  byHandle(handle: string): Profile | null {
    const row = this.db.prepare('SELECT * FROM profiles WHERE handle = ?').get(handle.toLowerCase());
    return row ? ProfileStore.toProfile(row as Record<string, string | null>) : null;
  }

  /** Whether another wallet already holds this handle. */
  handleTaken(handle: string, wallet: string): boolean {
    if (!handle) return false;
    const holder = this.byHandle(handle);
    return Boolean(holder && holder.wallet !== wallet.toLowerCase());
  }

  put(profile: Profile): void {
    this.db
      .prepare(
        `INSERT INTO profiles (wallet, handle, display_name, bio, avatar, tags, links, signed_at, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (wallet) DO UPDATE SET handle = excluded.handle, display_name = excluded.display_name, bio = excluded.bio,
           avatar = excluded.avatar, tags = excluded.tags, links = excluded.links, signed_at = excluded.signed_at, signature = excluded.signature`,
      )
      .run(
        profile.wallet.toLowerCase(),
        profile.handle || null,
        profile.displayName,
        profile.bio,
        profile.avatar,
        JSON.stringify(profile.tags),
        JSON.stringify(profile.links),
        profile.signedAt,
        profile.signature,
      );
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
