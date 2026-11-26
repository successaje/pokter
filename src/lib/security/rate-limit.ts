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

/** How long a row whose window was never recorded is kept: a day, the longest window in use. */
const UNKNOWN_WINDOW_MS = 86_400_000;

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
      count INTEGER NOT NULL,
      window_ms INTEGER NOT NULL DEFAULT ${UNKNOWN_WINDOW_MS}
    )
  `);
  /*
   * Tables made before each row knew its window. A row from then is kept a
   * day, the longest window any caller uses, because nothing says it was
   * shorter; its next use records the real one.
   */
  const columns = database.prepare('PRAGMA table_info(windows)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'window_ms')) {
    try {
      database.exec(`ALTER TABLE windows ADD COLUMN window_ms INTEGER NOT NULL DEFAULT ${UNKNOWN_WINDOW_MS}`);
    } catch (error) {
      /* Another process on the volume (a sweep script) added it first. */
      if (!/duplicate column/i.test(String(error))) throw error;
    }
  }
  return database;
}

/** How often closed windows are cleared, opportunistically, on the next request. */
const PRUNE_EVERY_MS = 3_600_000;
let lastPrunedAt = 0;

/*
 * A row is dead weight once its own window has closed, and not before.
 *
 * This deleted every row older than an hour, whatever its window. The gas
 * sponsor's per-day limits (two top-ups a wallet, six a client, four
 * hundred in all) were then cleared at the first prune after their first
 * hour, so they held for one to two hours rather than a day, and the
 * operator wallet could be asked for a day's top-ups that often.
 */
function prune(now: number): void {
  if (now - lastPrunedAt < PRUNE_EVERY_MS) return;
  lastPrunedAt = now;
  db().prepare('DELETE FROM windows WHERE started_at + window_ms <= ?').run(now);
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
      `INSERT INTO windows (key, started_at, count, window_ms) VALUES (?, ?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE
           WHEN ? - started_at >= ? THEN 1
           ELSE count + 1
         END,
         started_at = CASE
           WHEN ? - started_at >= ? THEN ?
           ELSE started_at
         END,
         window_ms = excluded.window_ms
       RETURNING started_at, count`,
    )
    .get(key, now, windowMs, now, windowMs, now, windowMs, now) as {
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
