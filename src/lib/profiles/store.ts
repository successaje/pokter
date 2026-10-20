import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Profile } from './model';

const DB_PATH = process.env.PROFILE_DB_PATH ?? './data/profiles.db';

/**
 * One self-provided profile per wallet, with the signature that set it.
 *
 * Its own file because nothing in it is evidence: keeping it out of the
 * stores Pokter's measurements live in means no query over those can pick
 * up a bio by accident.
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
        display_name TEXT NOT NULL,
        bio TEXT NOT NULL,
        avatar_url TEXT NOT NULL,
        links TEXT NOT NULL,
        signed_at TEXT NOT NULL,
        signature TEXT NOT NULL
      );
    `);
  }

  get(wallet: string): Profile | null {
    const row = this.db.prepare('SELECT * FROM profiles WHERE wallet = ?').get(wallet.toLowerCase()) as Record<string, string> | undefined;
    if (!row) return null;
    return {
      wallet: row.wallet,
      displayName: row.display_name,
      bio: row.bio,
      avatarUrl: row.avatar_url,
      links: JSON.parse(row.links) as string[],
      signedAt: row.signed_at,
      signature: row.signature,
    };
  }

  put(profile: Profile): void {
    this.db
      .prepare(
        `INSERT INTO profiles (wallet, display_name, bio, avatar_url, links, signed_at, signature) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (wallet) DO UPDATE SET display_name = excluded.display_name, bio = excluded.bio, avatar_url = excluded.avatar_url,
           links = excluded.links, signed_at = excluded.signed_at, signature = excluded.signature`,
      )
      .run(profile.wallet.toLowerCase(), profile.displayName, profile.bio, profile.avatarUrl, JSON.stringify(profile.links), profile.signedAt, profile.signature);
  }

  remove(wallet: string): void {
    this.db.prepare('DELETE FROM profiles WHERE wallet = ?').run(wallet.toLowerCase());
  }
}

let store: ProfileStore | null = null;
export function getProfileStore(): ProfileStore {
  store ??= new ProfileStore(DB_PATH);
  return store;
}
