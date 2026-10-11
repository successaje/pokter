import 'server-only';

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
    reason    TEXT NOT NULL,
    latency_ms INTEGER,
    PRIMARY KEY (run_id, scenario)
  );
`;

export type AssayRunStatus = 'checked' | 'not-askable';

export interface AssayScenarioResult {
  scenario: string;
  expected: unknown;
  observed: unknown;
  excerpt: string | null;
  pass: boolean;
  reason: string;
  latencyMs: number | null;
}

export interface AssayRun {
  suite: string;
  status: AssayRunStatus;
  /** Why the agent could not be asked, when it could not. */
  detail: string | null;
  passed: number;
  total: number;
  ranAt: string;
  results: AssayScenarioResult[];
}

class AssayStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  record(target: { chainId: number; tokenId: string }, run: Omit<AssayRun, 'ranAt'>): void {
    const ranAt = new Date().toISOString();
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO assay_runs (chain_id, token_id, suite, status, detail, passed, total, ran_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(target.chainId, target.tokenId, run.suite, run.status, run.detail, run.passed, run.total, ranAt);
    const insert = this.db.prepare(
      'INSERT INTO assay_results (run_id, scenario, expected, observed, excerpt, pass, reason, latency_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    for (const r of run.results) {
      insert.run(Number(lastInsertRowid), r.scenario, JSON.stringify(r.expected), r.observed === undefined ? null : JSON.stringify(r.observed), r.excerpt, r.pass ? 1 : 0, r.reason, r.latencyMs);
    }
  }

  latest(target: { chainId: number; tokenId: string }, suite: string): AssayRun | null {
    const run = this.db
      .prepare('SELECT * FROM assay_runs WHERE chain_id = ? AND token_id = ? AND suite = ? ORDER BY ran_at DESC, id DESC LIMIT 1')
      .get(target.chainId, target.tokenId, suite) as
      | { id: number; suite: string; status: AssayRunStatus; detail: string | null; passed: number; total: number; ran_at: string }
      | undefined;
    if (!run) return null;
    const rows = this.db.prepare('SELECT * FROM assay_results WHERE run_id = ? ORDER BY rowid').all(run.id) as Array<{
      scenario: string; expected: string; observed: string | null; excerpt: string | null; pass: number; reason: string; latency_ms: number | null;
    }>;
    return {
      suite: run.suite,
      status: run.status,
      detail: run.detail,
      passed: run.passed,
      total: run.total,
      ranAt: run.ran_at,
      results: rows.map((r) => ({
        scenario: r.scenario,
        expected: JSON.parse(r.expected),
        observed: r.observed === null ? null : JSON.parse(r.observed),
        excerpt: r.excerpt,
        pass: r.pass === 1,
        reason: r.reason,
        latencyMs: r.latency_ms,
      })),
    };
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
