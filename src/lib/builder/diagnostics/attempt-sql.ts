import type { DatabaseSync } from 'node:sqlite';

import type { AttemptCode, AttemptOutcome, AttemptSource, HireAttemptInput, HireAttemptRow } from './attempt';
import { newAttemptSalt } from './attempt';
import type { FailureLayer } from '@/lib/hire/failure';

/*
 * The SQL lives apart from the store that opens the file, so the statements
 * a builder's diagnostics depend on can be run in a test against a real
 * database instead of asserted about.
 *
 * `stats-query.ts` was split out for the same reason, and the comment there
 * records why: a query written with SQLite's `?1` passed typecheck, lint and
 * the build, and took the homepage down, because node:sqlite rejects that
 * binding whatever is bound to it. Only running the SQL finds that.
 */

export const HIRE_ATTEMPT_SCHEMA = `
  -- One row per attempt, keyed by a salted hash of who asked and what they
  -- asked for (see attemptFingerprint). A retry updates the row it already
  -- has, so an agent that timed out three times for one buyer is one
  -- attempt that was tried three times, not three attempts.
  CREATE TABLE IF NOT EXISTS hire_attempts (
    fingerprint     TEXT PRIMARY KEY,
    chain_id        INTEGER NOT NULL,
    token_id        TEXT    NOT NULL,
    escrow_chain_id INTEGER,
    source          TEXT    NOT NULL,
    outcome         TEXT    NOT NULL,
    code            TEXT,
    layer           TEXT,
    seller_reason   TEXT,
    tries           INTEGER NOT NULL,
    first_at        TEXT    NOT NULL,
    last_at         TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_hire_attempts_agent
    ON hire_attempts (chain_id, token_id, last_at DESC);

  CREATE TABLE IF NOT EXISTS hire_attempt_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

export function applyHireAttemptSchema(db: DatabaseSync): void {
  db.exec(HIRE_ATTEMPT_SCHEMA);
}

/**
 * The fingerprint salt this database was created with, made on first use.
 *
 * Read back rather than regenerated, because a new salt would make every
 * stored attempt unmatchable: the same buyer retrying after a deploy would
 * land on a fresh row and read as a second attempt. Which is the bug this
 * whole key exists to prevent.
 */
export function attemptSaltIn(db: DatabaseSync): string {
  const existing = db.prepare("SELECT value FROM hire_attempt_meta WHERE key = 'salt'").get() as
    | { value: string }
    | undefined;
  if (existing) return existing.value;
  const salt = newAttemptSalt();
  db.prepare("INSERT OR IGNORE INTO hire_attempt_meta (key, value) VALUES ('salt', ?)").run(salt);
  // Re-read: a concurrent writer may have won the insert, and both processes
  // have to agree on the salt or neither can match the other's rows.
  const settled = db.prepare("SELECT value FROM hire_attempt_meta WHERE key = 'salt'").get() as
    | { value: string }
    | undefined;
  return settled?.value ?? salt;
}

/**
 * Record an attempt, or fold a retry into the attempt it repeats.
 *
 * The latest outcome wins: a buyer whose third try got a price asked once
 * and was quoted, and showing that attempt as a failure because its first
 * try timed out would report a lost hire that was not lost. `first_at` is
 * never moved, so the attempt keeps the moment it began.
 */
export function recordHireAttemptIn(db: DatabaseSync, attempt: HireAttemptInput): void {
  db.prepare(
    `INSERT INTO hire_attempts
       (fingerprint, chain_id, token_id, escrow_chain_id, source, outcome, code, layer,
        seller_reason, tries, first_at, last_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT (fingerprint) DO UPDATE SET
       escrow_chain_id = excluded.escrow_chain_id,
       outcome         = excluded.outcome,
       code            = excluded.code,
       layer           = excluded.layer,
       seller_reason   = excluded.seller_reason,
       tries           = hire_attempts.tries + 1,
       last_at         = excluded.last_at`,
  ).run(
    attempt.fingerprint,
    attempt.chainId,
    attempt.tokenId,
    attempt.escrowChainId,
    attempt.source,
    attempt.outcome,
    attempt.code,
    attempt.layer,
    attempt.sellerReason,
    attempt.at,
    attempt.at,
  );
}

interface AttemptSqlRow {
  fingerprint: string;
  chain_id: number;
  token_id: string;
  escrow_chain_id: number | null;
  source: string;
  outcome: string;
  code: string | null;
  layer: string | null;
  seller_reason: string | null;
  tries: number;
  first_at: string;
  last_at: string;
}

function toRow(row: AttemptSqlRow): HireAttemptRow {
  return {
    fingerprint: row.fingerprint,
    chainId: row.chain_id,
    tokenId: row.token_id,
    escrowChainId: row.escrow_chain_id,
    source: row.source as AttemptSource,
    outcome: row.outcome as AttemptOutcome,
    code: (row.code as AttemptCode | null) ?? null,
    layer: (row.layer as FailureLayer | null) ?? null,
    sellerReason: row.seller_reason,
    tries: Number(row.tries),
    firstAt: row.first_at,
    lastAt: row.last_at,
  };
}

/**
 * Attempts on one agent since `since`, newest first.
 *
 * Scoped by `last_at`, which is when the attempt was last tried. An attempt
 * that began before the window and was retried inside it is inside it:
 * a builder asking what happened this month wants the retry they can still
 * do something about.
 */
export function readHireAttemptsIn(
  db: DatabaseSync,
  input: { chainId: number; tokenId: string; since: string },
): HireAttemptRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM hire_attempts
        WHERE chain_id = ? AND token_id = ? AND last_at >= ?
        ORDER BY last_at DESC`,
    )
    .all(input.chainId, input.tokenId, input.since) as unknown as AttemptSqlRow[];
  return rows.map(toRow);
}

/** Drops rows last tried before `before`. Returns how many went. */
export function pruneHireAttemptsIn(db: DatabaseSync, before: string): number {
  return Number(db.prepare('DELETE FROM hire_attempts WHERE last_at < ?').run(before).changes);
}
