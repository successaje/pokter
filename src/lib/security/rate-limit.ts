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
  /*
   * One statement is the security boundary. A SELECT followed by UPDATE lets
   * concurrent requests observe the same old count and all pass. SQLite
   * serializes this upsert and RETURNING gives us the value produced by the
   * atomic increment/reset.
   */
  const current = handle
    .prepare(
      `INSERT INTO windows (key, started_at, count) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE
           WHEN ? - started_at >= ? THEN 1
           ELSE count + 1
         END,
         started_at = CASE
           WHEN ? - started_at >= ? THEN ?
           ELSE started_at
         END
       RETURNING started_at, count`,
    )
    .get(key, now, now, windowMs, now, windowMs, now) as {
    started_at: number;
    count: number;
  };

  const allowed = current.count <= limit;
  return {
    allowed,
    retryAfterSeconds: allowed
      ? 0
      : Math.max(
          1,
          Math.ceil((windowMs - (now - current.started_at)) / 1000),
        ),
  };
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
  const trustedHeader =
    process.env.POKTER_TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase() ??
    'fly-client-ip';
  const value = request.headers.get(trustedHeader)?.trim();
  return value || 'unknown';
}
