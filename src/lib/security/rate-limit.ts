import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Abuse brake for public endpoints that fan out to third parties.
 *
 * Counters live on the mounted volume rather than in process memory. In memory
 * they reset on every deploy, and during a campaign that means each deploy
 * quietly reopens a full window to anyone watching — which is the opposite of
 * what a limiter is for, and the failure is invisible because nothing errors.
 *
 * Still per machine: the volume is not shared, so running two instances
 * doubles every limit. That is recorded in the audit register as POK-007
 * rather than solved here, because the fix is a shared store and this
 * deployment has one machine.
 */

const DB_PATH = process.env.RATE_LIMIT_DB_PATH ?? './data/rate-limit.db';

let database: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (database) return database;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  database = new DatabaseSync(DB_PATH);
  database.exec('PRAGMA journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS windows (
      key TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      count INTEGER NOT NULL
    )
  `);
  return database;
}

/** Rows older than this are dead weight; cleared opportunistically. */
const PRUNE_AFTER_MS = 3_600_000;
let lastPrunedAt = 0;

function prune(now: number): void {
  if (now - lastPrunedAt < PRUNE_AFTER_MS) return;
  lastPrunedAt = now;
  db().prepare('DELETE FROM windows WHERE started_at < ?').run(now - PRUNE_AFTER_MS);
}

export function consumeRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  prune(now);

  const handle = db();
  const current = handle
    .prepare('SELECT started_at, count FROM windows WHERE key = ?')
    .get(key) as { started_at: number; count: number } | undefined;

  if (!current || now - current.started_at >= windowMs) {
    handle
      .prepare(
        `INSERT INTO windows (key, started_at, count) VALUES (?, ?, 1)
         ON CONFLICT(key) DO UPDATE SET started_at = excluded.started_at, count = 1`,
      )
      .run(key, now);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((windowMs - (now - current.started_at)) / 1000),
      ),
    };
  }

  handle.prepare('UPDATE windows SET count = count + 1 WHERE key = ?').run(key);
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * The caller's identity for limiting purposes.
 *
 * Falls back to a single shared bucket when no forwarding header is present,
 * which is deliberately conservative: an unidentified caller sharing a bucket
 * with every other unidentified caller is a limit that holds, where a unique
 * key per unknown would be no limit at all.
 */
export function requestClientKey(request: Request): string {
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}
