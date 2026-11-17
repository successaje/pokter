import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Jobs on BNB Chain's ERC-8183 escrow contracts, indexed by job id, so a
 * wallet's hires and an agent's work on any marketplace can be read without
 * scanning the chain per request. Buyer, paid wallet and record never change
 * after creation and are stored; status changes, so it is stored as last read
 * with the time of that read, and the sweep re-reads the jobs of agent
 * wallets that can still move (`jobsToRefresh`).
 *
 * The Set and Earn tracker reads it too, scoped to the campaign window by
 * its own lookup; the index itself reaches back to the first job.
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS escrow_jobs (
    chain_id    INTEGER NOT NULL,
    job_id      INTEGER NOT NULL,
    client      TEXT NOT NULL,
    provider    TEXT NOT NULL,
    budget      TEXT NOT NULL,
    expired_at  INTEGER NOT NULL,
    status      INTEGER NOT NULL,
    description TEXT NOT NULL,
    PRIMARY KEY (chain_id, job_id)
  );
  CREATE INDEX IF NOT EXISTS idx_escrow_client ON escrow_jobs (client, chain_id, job_id);

  CREATE TABLE IF NOT EXISTS agent_wallets (
    wallet     TEXT PRIMARY KEY,
    chain_id   INTEGER NOT NULL,
    token_id   TEXT NOT NULL,
    name       TEXT,
    updated_at TEXT NOT NULL
  );

  -- One row per agent, where agent_wallets keeps one per wallet and so loses
  -- every agent but the last that shares one.
  CREATE TABLE IF NOT EXISTS registered_wallets (
    chain_id   INTEGER NOT NULL,
    token_id   TEXT NOT NULL,
    wallet     TEXT NOT NULL,
    name       TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (chain_id, token_id)
  );
  CREATE INDEX IF NOT EXISTS idx_registered_wallet ON registered_wallets (wallet, chain_id);

  CREATE INDEX IF NOT EXISTS idx_escrow_provider ON escrow_jobs (provider, chain_id, job_id);

  -- Whether a delivered job held an answer (see agent/answered-tasks.ts).
  CREATE TABLE IF NOT EXISTS task_answers (
    chain_id   INTEGER NOT NULL,
    job_id     INTEGER NOT NULL,
    verdict    TEXT NOT NULL,
    checked_at TEXT NOT NULL,
    PRIMARY KEY (chain_id, job_id)
  );

  CREATE TABLE IF NOT EXISTS job_cursors (
    chain_id    INTEGER PRIMARY KEY,
    first_job   INTEGER NOT NULL,
    next_job    INTEGER NOT NULL,
    updated_at  TEXT NOT NULL
  );
`;

/* `CREATE TABLE IF NOT EXISTS` adds no column to an existing table; the same tolerant migration the job store uses. */
const ADDED_COLUMNS = [
  'ALTER TABLE escrow_jobs ADD COLUMN payment_token TEXT',
  'ALTER TABLE escrow_jobs ADD COLUMN submitted_at INTEGER',
  'ALTER TABLE escrow_jobs ADD COLUMN status_read_at TEXT',
];

export interface EscrowJob {
  chainId: number;
  jobId: number;
  client: string;
  provider: string;
  budget: string;
  expiredAt: number;
  status: number;
  description: string;
  /**
   * The token the escrow holds this job's budget in, from `jobPaymentToken`.
   * Null when not read (rows indexed before the column, or a read that
   * failed) — unknown, never $U. Recorded for display; nothing here sums
   * budgets, and anything that ever does must sum per chain and token.
   */
  paymentToken?: string | null;
  /** When the provider submitted, in seconds, as the escrow records it; 0 for not submitted, null for not read. */
  submittedAt?: number | null;
  /** When `status` was read from chain; null for rows indexed before it was kept. */
  statusReadAt?: string | null;
}

type EscrowJobRow = {
  chain_id: number; job_id: number; client: string; provider: string; budget: string; expired_at: number; status: number; description: string;
  payment_token?: string | null; submitted_at?: number | null; status_read_at?: string | null;
};

const fromRow = (r: EscrowJobRow): EscrowJob => ({
  chainId: r.chain_id, jobId: r.job_id, client: r.client, provider: r.provider, budget: r.budget, expiredAt: r.expired_at, status: r.status, description: r.description,
  paymentToken: r.payment_token ?? null, submittedAt: r.submitted_at ?? null, statusReadAt: r.status_read_at ?? null,
});

export interface JobCursor {
  chainId: number;
  /** The lowest job id indexed. Every id from here to `nextJob - 1` has been read; the backfill lowers it to 1. */
  firstJob: number;
  /** The next job id to read. Every id before it has been indexed. */
  nextJob: number;
  updatedAt: string;
}

class QuestStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(SCHEMA);
    for (const statement of ADDED_COLUMNS) {
      try {
        this.db.exec(statement);
      } catch (error) {
        if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) throw error;
      }
    }
  }

  cursor(chainId: number): JobCursor | null {
    const row = this.db.prepare('SELECT * FROM job_cursors WHERE chain_id = ?').get(chainId) as
      | { chain_id: number; first_job: number; next_job: number; updated_at: string }
      | undefined;
    return row ? { chainId: row.chain_id, firstJob: row.first_job, nextJob: row.next_job, updatedAt: row.updated_at } : null;
  }

  private upsertJobs(chainId: number, jobs: EscrowJob[], readAt: string): void {
    const upsert = this.db.prepare(
      `INSERT INTO escrow_jobs (chain_id, job_id, client, provider, budget, expired_at, status, description, payment_token, submitted_at, status_read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (chain_id, job_id) DO UPDATE SET status = excluded.status,
         payment_token = COALESCE(excluded.payment_token, escrow_jobs.payment_token),
         submitted_at = COALESCE(excluded.submitted_at, escrow_jobs.submitted_at),
         status_read_at = excluded.status_read_at`,
    );
    for (const j of jobs) {
      upsert.run(
        chainId, j.jobId, j.client.toLowerCase(), j.provider.toLowerCase(), j.budget, j.expiredAt, j.status, j.description,
        j.paymentToken ? j.paymentToken.toLowerCase() : null, j.submittedAt ?? null, readAt,
      );
    }
  }

  private inTransaction(work: () => void): void {
    this.db.exec('BEGIN');
    try {
      work();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** Record a batch of jobs and move the cursor past it, together. */
  advance(chainId: number, jobs: EscrowJob[], firstJob: number, nextJob: number, readAt = new Date().toISOString()): void {
    this.inTransaction(() => {
      this.upsertJobs(chainId, jobs, readAt);
      this.db
        .prepare(
          `INSERT INTO job_cursors (chain_id, first_job, next_job, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT (chain_id) DO UPDATE SET next_job = excluded.next_job, updated_at = excluded.updated_at`,
        )
        .run(chainId, firstJob, nextJob, readAt);
    });
  }

  /** Record a batch of older jobs and lower the cursor's first job to it, together. */
  extendBack(chainId: number, jobs: EscrowJob[], firstJob: number, readAt = new Date().toISOString()): void {
    this.inTransaction(() => {
      this.upsertJobs(chainId, jobs, readAt);
      this.db
        .prepare('UPDATE job_cursors SET first_job = MIN(first_job, ?), updated_at = ? WHERE chain_id = ?')
        .run(firstJob, readAt, chainId);
    });
  }

  /**
   * Jobs of agent wallets whose status can still change, least recently read
   * first: funded or submitted, or open and last read before its deadline.
   *
   * The open case is most of them. The index reads new jobs every few
   * minutes, so it often stores a job between its creation and its funding.
   * One read after the deadline settles it: a job still open then was never
   * funded. A job read since `readBefore` is left for a later pass.
   */
  jobsToRefresh({ readBefore, limit }: { readBefore: string; limit: number }): EscrowJob[] {
    const rows = this.db
      .prepare(
        `SELECT e.* FROM escrow_jobs e
          WHERE e.provider IN (SELECT wallet FROM registered_wallets WHERE chain_id = e.chain_id
                               UNION SELECT wallet FROM agent_wallets WHERE chain_id = e.chain_id)
            AND (e.status IN (1, 2)
                 OR (e.status = 0 AND (e.status_read_at IS NULL
                                       OR e.status_read_at < strftime('%Y-%m-%dT%H:%M:%fZ', e.expired_at, 'unixepoch'))))
            AND (e.status_read_at IS NULL OR e.status_read_at < ?)
          ORDER BY e.status_read_at IS NOT NULL, e.status_read_at, e.job_id DESC
          LIMIT ?`,
      )
      .all(readBefore, limit) as EscrowJobRow[];
    return rows.map(fromRow);
  }

  /** Statuses read again from chain. */
  saveStatuses(reads: Array<{ chainId: number; jobId: number; status: number; submittedAt: number }>, readAt = new Date().toISOString()): void {
    const update = this.db.prepare('UPDATE escrow_jobs SET status = ?, submitted_at = ?, status_read_at = ? WHERE chain_id = ? AND job_id = ?');
    this.inTransaction(() => {
      for (const r of reads) update.run(r.status, r.submittedAt, readAt, r.chainId, r.jobId);
    });
  }

  /** Registered agent wallets, as read from the ERC-8004 identity registries. */
  saveAgentWallets(rows: Array<{ wallet: string; chainId: number; tokenId: string; name: string | null }>): void {
    const byWallet = this.db.prepare(
      `INSERT INTO agent_wallets (wallet, chain_id, token_id, name, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (wallet) DO UPDATE SET chain_id = excluded.chain_id, token_id = excluded.token_id, name = excluded.name, updated_at = excluded.updated_at`,
    );
    const byAgent = this.db.prepare(
      `INSERT INTO registered_wallets (chain_id, token_id, wallet, name, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (chain_id, token_id) DO UPDATE SET wallet = excluded.wallet, name = excluded.name, updated_at = excluded.updated_at`,
    );
    const now = new Date().toISOString();
    this.inTransaction(() => {
      for (const r of rows) {
        byWallet.run(r.wallet.toLowerCase(), r.chainId, r.tokenId, r.name, now);
        byAgent.run(r.chainId, r.tokenId, r.wallet.toLowerCase(), r.name, now);
      }
    });
  }

  /** Every registered agent wallet Pokter has read, one row per agent, with the registry it belongs to. */
  allAgentWallets(): Array<{ wallet: string; chainId: number; tokenId: string }> {
    const rows = this.db
      .prepare(
        `SELECT wallet, chain_id, token_id FROM registered_wallets
         UNION SELECT wallet, chain_id, token_id FROM agent_wallets a
          WHERE NOT EXISTS (SELECT 1 FROM registered_wallets r WHERE r.chain_id = a.chain_id AND r.token_id = a.token_id)`,
      )
      .all() as Array<{ wallet: string; chain_id: number; token_id: string }>;
    return rows.map((r) => ({ wallet: r.wallet, chainId: r.chain_id, tokenId: r.token_id }));
  }

  /** The wallet the registry names for one agent, lower-cased, or null when Pokter has not read one. */
  walletOf(chainId: number, tokenId: string): string | null {
    const row = (this.db.prepare('SELECT wallet FROM registered_wallets WHERE chain_id = ? AND token_id = ?').get(chainId, tokenId)
      ?? this.db.prepare('SELECT wallet FROM agent_wallets WHERE chain_id = ? AND token_id = ?').get(chainId, tokenId)) as { wallet: string } | undefined;
    return row?.wallet ?? null;
  }

  /** The agents on a registry chain whose registered wallet this is. */
  agentsOnWallet(chainId: number, wallet: string): Array<{ chainId: number; tokenId: string }> {
    const rows = this.db
      .prepare(
        `SELECT chain_id, token_id FROM registered_wallets WHERE chain_id = :chain AND wallet = :wallet
         UNION SELECT chain_id, token_id FROM agent_wallets a WHERE chain_id = :chain AND wallet = :wallet
           AND NOT EXISTS (SELECT 1 FROM registered_wallets r WHERE r.chain_id = a.chain_id AND r.token_id = a.token_id)`,
      )
      .all({ chain: chainId, wallet: wallet.toLowerCase() }) as Array<{ chain_id: number; token_id: string }>;
    return rows.map((r) => ({ chainId: r.chain_id, tokenId: r.token_id }));
  }

  /** Registered agents whose wallet has been paid through escrow at least once. */
  hiredAgents(): Array<{ chainId: number; tokenId: string }> {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT w.chain_id, w.token_id FROM escrow_jobs e
           JOIN (SELECT chain_id, token_id, wallet FROM registered_wallets UNION SELECT chain_id, token_id, wallet FROM agent_wallets) w
             ON w.wallet = e.provider`,
      )
      .all() as Array<{ chain_id: number; token_id: string }>;
    return rows.map((r) => ({ chainId: r.chain_id, tokenId: r.token_id }));
  }

  agentByWallet(wallet: string): { chainId: number; tokenId: string; name: string | null } | null {
    const row = this.db.prepare('SELECT chain_id, token_id, name FROM agent_wallets WHERE wallet = ?').get(wallet.toLowerCase()) as
      | { chain_id: number; token_id: string; name: string | null }
      | undefined;
    return row ? { chainId: row.chain_id, tokenId: row.token_id, name: row.name } : null;
  }

  /** Every job the escrow on `chainId` has paid, or would pay, this wallet, newest first. */
  byProvider(chainId: number, provider: string): EscrowJob[] {
    const rows = this.db
      .prepare('SELECT * FROM escrow_jobs WHERE provider = ? AND chain_id = ? ORDER BY job_id DESC')
      .all(provider.toLowerCase(), chainId) as EscrowJobRow[];
    return rows.map(fromRow);
  }

  /** An agent's jobs with any stored answer verdict, newest first. */
  byProviderWithVerdicts(provider: string, limit = 200): Array<EscrowJob & { verdict: string | null }> {
    const rows = this.db
      .prepare(
        `SELECT e.*, a.verdict FROM escrow_jobs e
           LEFT JOIN task_answers a ON a.chain_id = e.chain_id AND a.job_id = e.job_id
          WHERE e.provider = ? ORDER BY e.job_id DESC LIMIT ?`,
      )
      .all(provider.toLowerCase(), limit) as Array<EscrowJobRow & { verdict: string | null }>;
    return rows.map((r) => ({ ...fromRow(r), verdict: r.verdict }));
  }

  /**
   * Jobs for known agents that still need an answer verdict, newest first:
   * never checked, or `pending` (funded, not yet delivered) or `unreadable`
   * and last looked at before `recheckBefore`.
   */
  jobsNeedingVerdict(limit: number, recheckBefore: string): EscrowJob[] {
    const rows = this.db
      .prepare(
        `SELECT e.* FROM escrow_jobs e
           JOIN agent_wallets w ON w.wallet = e.provider
           LEFT JOIN task_answers a ON a.chain_id = e.chain_id AND a.job_id = e.job_id
          WHERE a.verdict IS NULL OR (a.verdict IN ('pending', 'unreadable') AND a.checked_at < ?)
          ORDER BY e.job_id DESC LIMIT ?`,
      )
      .all(recheckBefore, limit) as EscrowJobRow[];
    return rows.map(fromRow);
  }

  saveTaskVerdict(chainId: number, jobId: number, verdict: string): void {
    this.db
      .prepare(
        `INSERT INTO task_answers (chain_id, job_id, verdict, checked_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (chain_id, job_id) DO UPDATE SET verdict = excluded.verdict, checked_at = excluded.checked_at`,
      )
      .run(chainId, jobId, verdict, new Date().toISOString());
  }

  byClient(client: string): EscrowJob[] {
    const rows = this.db
      .prepare('SELECT * FROM escrow_jobs WHERE client = ? ORDER BY chain_id, job_id')
      .all(client.toLowerCase()) as EscrowJobRow[];
    return rows.map(fromRow);
  }
}

/** Relative on purpose, as in the other stores: see history/store.ts. */
const DB_PATH = process.env.QUEST_DB_PATH ?? './data/quest.db';

let cached: QuestStore | null = null;

export function getQuestStore(): QuestStore {
  if (cached) return cached;
  cached = new QuestStore(DB_PATH);
  return cached;
}
