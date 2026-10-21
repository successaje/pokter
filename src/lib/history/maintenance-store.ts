import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { JobAttempt } from './reconcile-schedule';

/**
 * What maintenance last managed, kept across restarts.
 *
 * Two questions were unanswerable and both cost a day. "Did `hireWatch` run"
 * could only be guessed from the absence of a label in a log line that holds
 * minutes — so when eighteen steps were skipped on 21 October, the only
 * record expired before anyone read it. And "which jobs has reconciliation
 * actually reached" had no answer at all, because the step walked every job
 * every run and kept nothing.
 *
 * Both are per-run facts that have to outlive the run, so they go on the
 * volume beside the sweeps and probes. Two tables rather than two stores,
 * because they are written in the same place at the same moment and read
 * together when someone asks whether maintenance is keeping up.
 *
 * No decision lives here. What counts as due, how backoff grows and what an
 * attempt does to a record are in `./reconcile-schedule`, which is pure and
 * tested; this file persists what those functions return.
 */

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS stage_runs (
    label               TEXT PRIMARY KEY,
    last_attempted_at   TEXT NOT NULL,
    last_succeeded_at   TEXT,
    last_outcome        TEXT NOT NULL,
    consecutive_failures INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS job_attempts (
    job_key           TEXT PRIMARY KEY,
    last_attempted_at TEXT,
    last_succeeded_at TEXT,
    failures          INTEGER NOT NULL
  );
`;

/** How a stage ended, in the vocabulary the run budget already reports. */
export type StageOutcome = 'ok' | 'failed' | 'timed-out' | 'skipped';

export interface StageRun {
  label: string;
  lastAttemptedAt: string;
  /** Null until it has ever worked. The question a failed attempt must not answer. */
  lastSucceededAt: string | null;
  lastOutcome: StageOutcome;
  consecutiveFailures: number;
}

type StageRow = { label: string; last_attempted_at: string; last_succeeded_at: string | null; last_outcome: StageOutcome; consecutive_failures: number };
type JobRow = { job_key: string; last_attempted_at: string | null; last_succeeded_at: string | null; failures: number };

class MaintenanceStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  /**
   * Record how a stage ended.
   *
   * `last_succeeded_at` only moves on `ok`, so a run of failures leaves the
   * staleness visible rather than refreshing a timestamp that means nothing.
   */
  noteStage(label: string, outcome: StageOutcome, at: string): void {
    const previous = this.stage(label);
    const succeededAt = outcome === 'ok' ? at : previous?.lastSucceededAt ?? null;
    const failures = outcome === 'ok' ? 0 : (previous?.consecutiveFailures ?? 0) + 1;
    this.db
      .prepare(
        `INSERT INTO stage_runs (label, last_attempted_at, last_succeeded_at, last_outcome, consecutive_failures)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(label) DO UPDATE SET last_attempted_at = excluded.last_attempted_at,
           last_succeeded_at = excluded.last_succeeded_at, last_outcome = excluded.last_outcome,
           consecutive_failures = excluded.consecutive_failures`,
      )
      .run(label, at, succeededAt, outcome, failures);
  }

  stage(label: string): StageRun | null {
    const row = this.db.prepare('SELECT * FROM stage_runs WHERE label = ?').get(label) as StageRow | undefined;
    return row ? fromStageRow(row) : null;
  }

  /** Every stage, for the health body and for anyone asking what is behind. */
  stages(): StageRun[] {
    return (this.db.prepare('SELECT * FROM stage_runs ORDER BY label').all() as StageRow[]).map(fromStageRow);
  }

  /** The attempt records, as the scheduling functions want them. */
  jobAttempts(): Map<string, JobAttempt> {
    const rows = this.db.prepare('SELECT * FROM job_attempts').all() as JobRow[];
    return new Map(rows.map((r) => [r.job_key, { lastAttemptedAt: r.last_attempted_at, lastSucceededAt: r.last_succeeded_at, failures: r.failures }]));
  }

  /**
   * Write an attempt back, unless a newer one is already recorded.
   *
   * The guard is for work that outlived its run. `withTimeout` bounds the
   * waiting and not the promise, so a reconciliation the budget stopped
   * waiting for can still settle — possibly after the next run has started
   * and already recorded its own attempt. Last-write-wins would let that
   * stale settle overwrite the newer state, which is how a job silently
   * loses its place in the queue. A write that is not newer is dropped.
   */
  noteJobAttempt(key: string, attempt: JobAttempt): boolean {
    const existing = this.db.prepare('SELECT last_attempted_at FROM job_attempts WHERE job_key = ?').get(key) as { last_attempted_at: string | null } | undefined;
    if (existing?.last_attempted_at && attempt.lastAttemptedAt && existing.last_attempted_at > attempt.lastAttemptedAt) {
      return false;
    }
    this.db
      .prepare(
        `INSERT INTO job_attempts (job_key, last_attempted_at, last_succeeded_at, failures)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(job_key) DO UPDATE SET last_attempted_at = excluded.last_attempted_at,
           last_succeeded_at = excluded.last_succeeded_at, failures = excluded.failures`,
      )
      .run(key, attempt.lastAttemptedAt, attempt.lastSucceededAt, attempt.failures);
    return true;
  }
}

const fromStageRow = (r: StageRow): StageRun => ({
  label: r.label,
  lastAttemptedAt: r.last_attempted_at,
  lastSucceededAt: r.last_succeeded_at,
  lastOutcome: r.last_outcome,
  consecutiveFailures: r.consecutive_failures,
});

let store: MaintenanceStore | null = null;
export function getMaintenanceStore(): MaintenanceStore {
  store ??= new MaintenanceStore(process.env.MAINTENANCE_DB_PATH ?? './data/maintenance.db');
  return store;
}
