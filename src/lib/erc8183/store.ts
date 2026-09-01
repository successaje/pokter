import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { HiredJob, JobStatusName } from './types';

/**
 * Pokter's index of jobs it commissioned.
 *
 * Authoritative job state lives in the AgenticCommerce kernel; this table only
 * records which jobs are ours and what we last read, so the UI can list them
 * without scanning the chain. `refreshJob` always re-reads from the kernel
 * rather than trusting a row here.
 */
export interface JobStore {
  record(job: HiredJob): void;
  all(): HiredJob[];
  byId(id: string): HiredJob | null;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS jobs (
    id                TEXT PRIMARY KEY,
    job_id            TEXT NOT NULL,
    chain_id          INTEGER NOT NULL,
    is_testnet        INTEGER NOT NULL,
    agent_token_id    TEXT NOT NULL,
    agent_name        TEXT NOT NULL,
    provider          TEXT NOT NULL,
    task              TEXT NOT NULL,
    budget_raw        TEXT NOT NULL,
    expired_at        TEXT NOT NULL,
    hired_at          TEXT NOT NULL,
    hire_tx_hash      TEXT,
    status            TEXT NOT NULL,
    status_checked_at TEXT NOT NULL,
    deliverable_url   TEXT,
    settle_tx_hash    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_hired ON jobs (hired_at DESC);
`;

interface JobRow {
  id: string;
  job_id: string;
  chain_id: number;
  is_testnet: number;
  agent_token_id: string;
  agent_name: string;
  provider: string;
  task: string;
  budget_raw: string;
  expired_at: string;
  hired_at: string;
  hire_tx_hash: string | null;
  status: string;
  status_checked_at: string;
  deliverable_url: string | null;
  settle_tx_hash: string | null;
}

function toJob(row: JobRow): HiredJob {
  return {
    id: row.id,
    jobId: row.job_id,
    chainId: row.chain_id,
    isTestnet: row.is_testnet === 1,
    agentTokenId: row.agent_token_id,
    agentName: row.agent_name,
    provider: row.provider as `0x${string}`,
    task: row.task,
    budgetRaw: row.budget_raw,
    expiredAt: row.expired_at,
    hiredAt: row.hired_at,
    hireTxHash: row.hire_tx_hash as `0x${string}` | null,
    status: row.status as JobStatusName,
    statusCheckedAt: row.status_checked_at,
    deliverableUrl: row.deliverable_url,
    settleTxHash: row.settle_tx_hash as `0x${string}` | null,
  };
}

class SqliteJobStore implements JobStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  record(job: HiredJob): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO jobs
           (id, job_id, chain_id, is_testnet, agent_token_id, agent_name,
            provider, task, budget_raw, expired_at, hired_at, hire_tx_hash,
            status, status_checked_at, deliverable_url, settle_tx_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        job.id,
        job.jobId,
        job.chainId,
        job.isTestnet ? 1 : 0,
        job.agentTokenId,
        job.agentName,
        job.provider,
        job.task,
        job.budgetRaw,
        job.expiredAt,
        job.hiredAt,
        job.hireTxHash,
        job.status,
        job.statusCheckedAt,
        job.deliverableUrl,
        job.settleTxHash,
      );
  }

  all(): HiredJob[] {
    const rows = this.db
      .prepare('SELECT * FROM jobs ORDER BY hired_at DESC')
      .all() as unknown as JobRow[];
    return rows.map(toJob);
  }

  byId(id: string): HiredJob | null {
    const row = this.db
      .prepare('SELECT * FROM jobs WHERE id = ?')
      .get(id) as unknown as JobRow | undefined;
    return row ? toJob(row) : null;
  }
}

/**
 * Left as a relative path on purpose. `path.resolve` on an environment-derived
 * value makes the bundler trace the entire project, and node:sqlite resolves
 * relative paths against the working directory just as well.
 */
const DB_PATH = process.env.JOB_DB_PATH ?? './data/jobs.db';

let cached: JobStore | null = null;

export function getJobStore(): JobStore {
  if (cached) return cached;
  cached = new SqliteJobStore(DB_PATH);
  return cached;
}
