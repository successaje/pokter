import 'server-only';

import { withoutClaimedIds } from './claimed-ids';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { DUPLICATE_LOSERS_SQL, JOB_CONFLICTS_DDL, JOB_IDENTITY_INDEX } from './job-dedupe';
import type { HiredJob, JobStatusName } from './types';

/**
 * What the seller said when told its job was funded.
 *
 * `accepted` and `rejected` are the seller's own answers; `unreachable` is
 * Pokter failing to get one (no card, no notify skill, a timeout). The
 * reason is the seller's words, kept because the buyer has no other way to
 * learn them: a refused job otherwise looks like a slow one until it
 * expires.
 */
export type SellerNoticeStatus = 'accepted' | 'rejected' | 'unreachable';

/**
 * A quote Pokter negotiated for a buyer, by its negotiation hash.
 *
 * A job written as the seller's signed quote alone carries no Pokter
 * fields, and other marketplaces write the same format for the same
 * sellers. The hash in the job matching a quote Pokter itself negotiated is
 * what makes it Pokter's: it identifies the agent exactly, survives a tab
 * closed before indexing, and cannot be claimed for someone else's job.
 */
export interface QuoteIntent {
  negotiationHash: string;
  escrowChainId: number;
  provider: string;
  agentChainId: number;
  agentTokenId: string;
  agentName: string;
}

export interface SellerNotice {
  chainId: number;
  jobId: string;
  status: SellerNoticeStatus;
  reason: string | null;
  attempts: number;
  firstAt: string;
  lastAt: string;
}

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
  byAgent(chainId: number, tokenId: string): HiredJob[];
  /** Jobs funded by one wallet, newest first. */
  byClient(client: string): HiredJob[];
  /**
   * A named place to remember how far a watcher has already looked.
   *
   * Kept beside the jobs rather than in its own store because the only thing
   * that needs it is the hire watcher, and a cursor without the rows it
   * refers to is meaningless.
   */
  readCursor(name: string): string | null;
  writeCursor(name: string, value: string): void;
  recordNotice(input: { chainId: number; jobId: string; status: SellerNoticeStatus; reason: string | null }): SellerNotice;
  recordQuoteIntent(intent: QuoteIntent): void;
  quoteIntent(negotiationHash: string): QuoteIntent | null;
  noticeFor(chainId: number, jobId: string): SellerNotice | null;
  notices(): SellerNotice[];
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS cursors (
    name       TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id                TEXT PRIMARY KEY,
    job_id            TEXT NOT NULL,
    chain_id          INTEGER NOT NULL,
    is_testnet        INTEGER NOT NULL,
    agent_chain_id    INTEGER,
    agent_token_id    TEXT NOT NULL,
    agent_name        TEXT NOT NULL,
    provider_label    TEXT,
    provider          TEXT NOT NULL,
    task              TEXT NOT NULL,
    budget_raw        TEXT NOT NULL,
    expired_at        TEXT NOT NULL,
    hired_at          TEXT NOT NULL,
    hire_tx_hash      TEXT,
    status            TEXT NOT NULL,
    status_checked_at TEXT NOT NULL,
    deliverable_url   TEXT,
    settle_tx_hash    TEXT,
    dispute_tx_hash   TEXT,
    reclaim_tx_hash   TEXT,
    client            TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_hired ON jobs (hired_at DESC);

  CREATE TABLE IF NOT EXISTS quote_intents (
    negotiation_hash TEXT PRIMARY KEY,
    escrow_chain_id  INTEGER NOT NULL,
    provider         TEXT NOT NULL,
    agent_chain_id   INTEGER NOT NULL,
    agent_token_id   TEXT NOT NULL,
    agent_name       TEXT NOT NULL,
    created_at       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS seller_notices (
    chain_id INTEGER NOT NULL,
    job_id   TEXT NOT NULL,
    status   TEXT NOT NULL,
    reason   TEXT,
    attempts INTEGER NOT NULL,
    first_at TEXT NOT NULL,
    last_at  TEXT NOT NULL,
    PRIMARY KEY (chain_id, job_id)
  );
`;

interface NoticeRow {
  chain_id: number;
  job_id: string;
  status: string;
  reason: string | null;
  attempts: number;
  first_at: string;
  last_at: string;
}

function toNotice(row: NoticeRow): SellerNotice {
  return {
    chainId: row.chain_id,
    jobId: row.job_id,
    status: row.status as SellerNoticeStatus,
    reason: row.reason,
    attempts: row.attempts,
    firstAt: row.first_at,
    lastAt: row.last_at,
  };
}

interface JobRow {
  id: string;
  job_id: string;
  chain_id: number;
  is_testnet: number;
  agent_chain_id: number | null;
  agent_token_id: string;
  agent_name: string;
  provider_label: string | null;
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
  dispute_tx_hash: string | null;
  reclaim_tx_hash: string | null;
  client: string | null;
}

function toJob(row: JobRow): HiredJob {
  return {
    id: row.id,
    jobId: row.job_id,
    chainId: row.chain_id,
    isTestnet: row.is_testnet === 1,
    agentChainId: row.agent_chain_id ?? undefined,
    agentTokenId: row.agent_token_id,
    agentName: row.agent_name,
    providerLabel: row.provider_label ?? undefined,
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
    disputeTxHash: row.dispute_tx_hash as `0x${string}` | null,
    reclaimTxHash: row.reclaim_tx_hash as `0x${string}` | null,
    ...(row.client ? { client: row.client as `0x${string}` } : {}),
  };
}

class SqliteJobStore implements JobStore {
  get handle(): DatabaseSync {
    return this.db;
  }

  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(SCHEMA);
    // SQLite's CREATE TABLE IF NOT EXISTS does not add columns to an existing
    // installation. Keep the index forward-compatible without dropping the
    // user's recorded jobs.
    for (const statement of [
      'ALTER TABLE jobs ADD COLUMN agent_chain_id INTEGER',
      'ALTER TABLE jobs ADD COLUMN provider_label TEXT',
      'ALTER TABLE jobs ADD COLUMN dispute_tx_hash TEXT',
      'ALTER TABLE jobs ADD COLUMN reclaim_tx_hash TEXT',
      'ALTER TABLE jobs ADD COLUMN client TEXT',
    ]) {
      try {
        this.db.exec(statement);
      } catch (error) {
        if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) {
          throw error;
        }
      }
    }
    // After the migration, so an older database already has the column.
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs (client)');
    this.dedupeJobs();
  }

  /**
   * One row per job, enforced by the database.
   *
   * The table was keyed on `id` alone, and its two writers mint different
   * ones: `hireAgent` a random UUID at funding time, the chain indexer
   * `"<chainId>:<jobId>"`. So the same job could be recorded twice, and
   * was — 14 of 124 jobs had a second row, and job 97/1522 had two naming
   * *different agents*, which credited a delivery to an agent that never
   * made it. The public receipts endpoint counted 138 rows for 124 jobs,
   * overstating every figure it publishes by about 11%.
   *
   * A unique index fixes it going forward for free: `record` already does
   * INSERT OR REPLACE, and SQLite drops rows violating any unique
   * constraint — so the later write wins, which is the chain-derived one.
   *
   * The losers are moved aside rather than deleted. One of each pair is
   * wrong about something, and which one cannot be decided here without
   * reading the chain; `scripts/dedupe-jobs.mts` adjudicates them against
   * the escrow afterwards, and it needs the rows to still exist.
   */
  private dedupeJobs(): void {
    this.db.exec(JOB_CONFLICTS_DDL);
    const losers = this.db.prepare(DUPLICATE_LOSERS_SQL).all() as { id: string; chain_id: number; job_id: string }[];

    const now = new Date().toISOString();
    for (const loser of losers) {
      const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(loser.id);
      this.db
        .prepare(`INSERT OR REPLACE INTO job_row_conflicts (id, chain_id, job_id, row_json, set_aside_at)
          VALUES (?,?,?,?,?)`)
        .run(loser.id, loser.chain_id, loser.job_id, JSON.stringify(row), now);
      this.db.prepare('DELETE FROM jobs WHERE id = ?').run(loser.id);
    }
    if (losers.length > 0) {
      console.warn(`[job-store] set aside ${losers.length} duplicate job row(s); run scripts/dedupe-jobs.mts to adjudicate them against the chain`);
    }
    this.db.exec(JOB_IDENTITY_INDEX);
  }

  record(job: HiredJob): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO jobs
           (id, job_id, chain_id, is_testnet, agent_chain_id, agent_token_id,
            agent_name, provider_label, provider, task, budget_raw, expired_at,
            hired_at, hire_tx_hash, status, status_checked_at, deliverable_url,
            settle_tx_hash, dispute_tx_hash, reclaim_tx_hash, client)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 COALESCE(?, (SELECT client FROM jobs WHERE id = ?)))`,
      )
      .run(
        job.id,
        job.jobId,
        job.chainId,
        job.isTestnet ? 1 : 0,
        job.agentChainId ?? null,
        job.agentTokenId,
        job.agentName,
        job.providerLabel ?? null,
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
        job.disputeTxHash ?? null,
        job.reclaimTxHash ?? null,
        // A caller that did not read the funder must not erase a known one.
        job.client ? job.client.toLowerCase() : null,
        job.id,
      );
  }

  all(): HiredJob[] {
    const rows = this.db
      .prepare('SELECT * FROM jobs ORDER BY hired_at DESC')
      .all() as unknown as JobRow[];
    // Rows whose escrow id a later hire for another agent holds were never jobs (see claimed-ids.ts).
    return withoutClaimedIds(rows.map(toJob));
  }

  /** Ids of rows whose escrow id belongs to another agent's later hire. */
  private phantomIds(): Set<string> {
    const rows = (this.db.prepare('SELECT * FROM jobs').all() as unknown as JobRow[]).map(toJob);
    const kept = new Set(withoutClaimedIds(rows).map((job) => job.id));
    return new Set(rows.filter((job) => !kept.has(job.id)).map((job) => job.id));
  }

  readCursor(name: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM cursors WHERE name = ?')
      .get(name) as { value: string } | undefined;
    return row?.value ?? null;
  }

  writeCursor(name: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO cursors (name, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (name) DO UPDATE SET value = excluded.value,
                                          updated_at = excluded.updated_at`,
      )
      .run(name, value, new Date().toISOString());
  }

  recordNotice(input: { chainId: number; jobId: string; status: SellerNoticeStatus; reason: string | null }): SellerNotice {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO seller_notices (chain_id, job_id, status, reason, attempts, first_at, last_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT (chain_id, job_id) DO UPDATE SET
           status = excluded.status, reason = excluded.reason,
           attempts = seller_notices.attempts + 1, last_at = excluded.last_at`,
      )
      .run(input.chainId, input.jobId, input.status, input.reason?.slice(0, 500) ?? null, now, now);
    return this.noticeFor(input.chainId, input.jobId)!;
  }

  recordQuoteIntent(intent: QuoteIntent): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO quote_intents (negotiation_hash, escrow_chain_id, provider, agent_chain_id, agent_token_id, agent_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(intent.negotiationHash.toLowerCase(), intent.escrowChainId, intent.provider.toLowerCase(), intent.agentChainId, intent.agentTokenId, intent.agentName.slice(0, 120), new Date().toISOString());
  }

  quoteIntent(negotiationHash: string): QuoteIntent | null {
    const row = this.db.prepare('SELECT * FROM quote_intents WHERE negotiation_hash = ?').get(negotiationHash.toLowerCase()) as
      | { negotiation_hash: string; escrow_chain_id: number; provider: string; agent_chain_id: number; agent_token_id: string; agent_name: string }
      | undefined;
    return row
      ? { negotiationHash: row.negotiation_hash, escrowChainId: row.escrow_chain_id, provider: row.provider, agentChainId: row.agent_chain_id, agentTokenId: row.agent_token_id, agentName: row.agent_name }
      : null;
  }

  noticeFor(chainId: number, jobId: string): SellerNotice | null {
    const row = this.db
      .prepare('SELECT * FROM seller_notices WHERE chain_id = ? AND job_id = ?')
      .get(chainId, jobId) as unknown as NoticeRow | undefined;
    return row ? toNotice(row) : null;
  }

  notices(): SellerNotice[] {
    const rows = this.db.prepare('SELECT * FROM seller_notices').all() as unknown as NoticeRow[];
    return rows.map(toNotice);
  }

  byId(id: string): HiredJob | null {
    const row = this.db
      .prepare('SELECT * FROM jobs WHERE id = ?')
      .get(id) as unknown as JobRow | undefined;
    return row ? toJob(row) : null;
  }

  byClient(client: string): HiredJob[] {
    const rows = this.db
      .prepare('SELECT * FROM jobs WHERE client = ? ORDER BY hired_at DESC')
      .all(client.toLowerCase()) as unknown as JobRow[];
    const phantoms = this.phantomIds();
    return rows.map(toJob).filter((job) => !phantoms.has(job.id));
  }

  byAgent(chainId: number, tokenId: string): HiredJob[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM jobs
         WHERE agent_token_id = ?
           AND (agent_chain_id = ? OR (agent_chain_id IS NULL AND ? = 56))
         ORDER BY hired_at DESC`,
      )
      .all(tokenId, chainId, chainId) as unknown as JobRow[];
    const phantoms = this.phantomIds();
    return rows.map(toJob).filter((job) => !phantoms.has(job.id));
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

/**
 * The raw handle, for the one caller that has to work on rows the
 * `JobStore` interface deliberately does not expose: the quarantined
 * duplicates. Goes through `getJobStore` first so the migration has run.
 */
export function conflictDatabase(): DatabaseSync {
  getJobStore();
  return (cached as SqliteJobStore).handle;
}
