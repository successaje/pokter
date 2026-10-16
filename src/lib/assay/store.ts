import 'server-only';

import { freeRunStatus } from './run-status';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Correctness check results: one run per agent per suite, and the outcome
 * of every scenario in it, kept with the agent's own words so a reader can
 * see why each one passed or failed.
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS assay_runs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id  INTEGER NOT NULL,
    token_id  TEXT NOT NULL,
    suite     TEXT NOT NULL,
    status    TEXT NOT NULL,
    detail    TEXT,
    passed    INTEGER NOT NULL,
    total     INTEGER NOT NULL,
    ran_at    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_assay_runs_agent ON assay_runs (chain_id, token_id, suite, ran_at DESC);

  CREATE TABLE IF NOT EXISTS assay_results (
    run_id    INTEGER NOT NULL,
    scenario  TEXT NOT NULL,
    expected  TEXT NOT NULL,
    observed  TEXT,
    excerpt   TEXT,
    pass      INTEGER NOT NULL,
    outcome   TEXT,
    reason    TEXT NOT NULL,
    latency_ms INTEGER,
    PRIMARY KEY (run_id, scenario)
  );

  -- Failed attempts, which produce no result to show but must still move
  -- the agent back in the queue (see assay/queue).
  CREATE TABLE IF NOT EXISTS assay_attempts (
    chain_id     INTEGER NOT NULL,
    token_id     TEXT NOT NULL,
    suite        TEXT NOT NULL,
    attempted_at TEXT NOT NULL,
    error        TEXT,
    PRIMARY KEY (chain_id, token_id, suite)
  );

  CREATE TABLE IF NOT EXISTS assay_samples (
    suite      TEXT PRIMARY KEY,
    accounts   TEXT NOT NULL,
    sampled_at TEXT NOT NULL
  );
`;

import type { AssayRun, AssayRunStatus, AssayVia } from './types';

export type { AssayRun, AssayRunStatus, AssayScenarioResult, AssayVia } from './types';

class AssayStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(SCHEMA);
    /*
     * Added when checks learned to grade a paid delivery. Existing rows
     * were all free calls, which is what the default says, so the column
     * is backfilled by its own definition rather than by a rewrite — and
     * a recorded check is evidence shown on an agent's page, so dropping
     * the table to recreate it would destroy published results.
     */
    for (const migration of [
      "ALTER TABLE assay_runs ADD COLUMN via TEXT NOT NULL DEFAULT 'free-call'",
      'ALTER TABLE assay_results ADD COLUMN job_id TEXT',
    ]) {
      try {
        this.db.exec(migration);
      } catch (error) {
        if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) throw error;
      }
    }
  }

  record(target: { chainId: number; tokenId: string }, run: Omit<AssayRun, 'ranAt'>): void {
    const ranAt = new Date().toISOString();
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO assay_runs (chain_id, token_id, suite, status, detail, passed, total, ran_at, via) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(target.chainId, target.tokenId, run.suite, run.status, run.detail, run.passed, run.total, ranAt, run.via);
    const insert = this.db.prepare(
      'INSERT INTO assay_results (run_id, scenario, expected, observed, excerpt, pass, outcome, reason, latency_ms, job_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    for (const r of run.results) {
      insert.run(Number(lastInsertRowid), r.scenario, JSON.stringify(r.expected), r.observed === undefined ? null : JSON.stringify(r.observed), r.excerpt, r.pass ? 1 : 0, r.outcome, r.reason, r.latencyMs, r.jobId ?? null);
    }
  }

  latest(target: { chainId: number; tokenId: string }, suite: string): AssayRun | null {
    /*
     * A graded paid hire outranks any free call. The free check runs every
     * few days and the paid one only when the team funds it, so taking the
     * newest run let a free call — often an agent saying it sells this work
     * rather than giving it away — replace the escrow-graded result that
     * was the better evidence. Brinkwatch's page showed "matched 0 of 3"
     * from a free preview over two graded paid answers.
     */
    const run = this.db
      .prepare("SELECT * FROM assay_runs WHERE chain_id = ? AND token_id = ? AND suite = ? ORDER BY (via = 'paid-hire' AND status = 'checked') DESC, ran_at DESC, id DESC LIMIT 1")
      .get(target.chainId, target.tokenId, suite) as
      | { id: number; suite: string; status: AssayRunStatus; detail: string | null; passed: number; total: number; ran_at: string; via: AssayVia | null }
      | undefined;
    if (!run) return null;
    const rows = this.db.prepare('SELECT * FROM assay_results WHERE run_id = ? ORDER BY rowid').all(run.id) as Array<{
      scenario: string; expected: string; observed: string | null; excerpt: string | null; pass: number; outcome: string | null; reason: string; latency_ms: number | null; job_id: string | null;
    }>;
    const loaded: AssayRun = {
      suite: run.suite,
      status: run.status,
      detail: run.detail,
      passed: run.passed,
      total: run.total,
      ranAt: run.ran_at,
      // Rows written before the column existed were all free calls.
      via: run.via ?? 'free-call',
      results: rows.map((r) => ({
        scenario: r.scenario,
        expected: JSON.parse(r.expected),
        observed: r.observed === null ? null : JSON.parse(r.observed),
        excerpt: r.excerpt,
        pass: r.pass === 1,
        outcome: r.outcome ?? (r.pass === 1 ? 'correct' : 'wrong'),
        reason: r.reason,
        latencyMs: r.latency_ms,
        jobId: r.job_id,
      })),
    };
    /*
     * Free runs recorded before freeRunStatus counted every brief as a
     * failure even when nothing was answered. Read with today's rule so
     * those 0/N records stop showing as failures without rewriting them.
     */
    if (loaded.status === 'checked' && loaded.via === 'free-call') {
      const judged = freeRunStatus(loaded.results);
      if (judged.status === 'not-askable') return { ...loaded, status: 'not-askable', detail: judged.detail, passed: 0 };
    }
    return loaded;
  }

  sample(suite: string): { accounts: string[]; sampledAt: string } | null {
    const row = this.db.prepare('SELECT accounts, sampled_at FROM assay_samples WHERE suite = ?').get(suite) as { accounts: string; sampled_at: string } | undefined;
    return row ? { accounts: JSON.parse(row.accounts) as string[], sampledAt: row.sampled_at } : null;
  }

  saveSample(suite: string, accounts: string[]): void {
    this.db
      .prepare('INSERT INTO assay_samples (suite, accounts, sampled_at) VALUES (?, ?, ?) ON CONFLICT (suite) DO UPDATE SET accounts = excluded.accounts, sampled_at = excluded.sampled_at')
      .run(suite, JSON.stringify(accounts), new Date().toISOString());
  }

  /** A check that failed before producing a result; only the latest is kept. */
  noteFailedAttempt(target: { chainId: number; tokenId: string }, suite: string, error: string): void {
    this.db
      .prepare(
        'INSERT INTO assay_attempts (chain_id, token_id, suite, attempted_at, error) VALUES (?, ?, ?, ?, ?) ON CONFLICT (chain_id, token_id, suite) DO UPDATE SET attempted_at = excluded.attempted_at, error = excluded.error',
      )
      .run(target.chainId, target.tokenId, suite, new Date().toISOString(), error.slice(0, 500));
  }

  /** When each agent's last failed attempt was. Agents never failed are absent. */
  lastFailedAttemptAt(suite: string): Map<string, string> {
    const rows = this.db
      .prepare('SELECT chain_id, token_id, attempted_at AS at FROM assay_attempts WHERE suite = ?')
      .all(suite) as Array<{ chain_id: number; token_id: string; at: string }>;
    return new Map(rows.map((r) => [`${r.chain_id}:${r.token_id}`, r.at]));
  }

  /** When each agent was last run on a suite. Agents never run are absent. */
  lastRunAt(suite: string): Map<string, string> {
    const rows = this.db
      .prepare('SELECT chain_id, token_id, MAX(ran_at) AS at FROM assay_runs WHERE suite = ? GROUP BY chain_id, token_id')
      .all(suite) as Array<{ chain_id: number; token_id: string; at: string }>;
    return new Map(rows.map((r) => [`${r.chain_id}:${r.token_id}`, r.at]));
  }
}

/** Relative on purpose, as in the other stores: see history/store.ts. */
const DB_PATH = process.env.ASSAY_DB_PATH ?? './data/assay.db';

let cached: AssayStore | null = null;

export function getAssayStore(): AssayStore {
  if (cached) return cached;
  cached = new AssayStore(DB_PATH);
  return cached;
}
