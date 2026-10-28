import 'server-only';

import { withoutClaimedIds } from './claimed-ids';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { oneRowPerJob } from './job-dedupe';
import {
  attachPreparedHireJob,
  ensurePreparedHires,
  readPreparedHire,
  recordPreparedHire,
  type JobAttachment,
  type PreparedHireRecord,
  type PreparedHireWrite,
} from '@/lib/assistant/prepared-store';
import type { CriteriaAgreement } from '@/lib/proofrun/agreement';
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
/** A funding attempt as the server keeps it, for other devices of the same wallet. */
export interface RemoteAttemptRow {
  publicId: string;
  secretHash: string;
  wallet: string;
  chainId: number;
  provider: string;
  description: string;
  token: string;
  amountRaw: string;
  predictedJobId: string | null;
  jobId: string | null;
  callsId: string | null;
  txHashes: string[];
  prompt: string | null;
  fundableUntil: number | null;
  /** True once the chain shows the wallet acted: a transaction it sent, or a job it is the client of. */
  verified: boolean;
  state: 'open' | 'closed';
  closeReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobStore {
  record(job: HiredJob): void;
  /**
   * The token a job is bound to, from the escrow. Written once per row and
   * never cleared: a later record that does not know the token keeps it.
   */
  setPaymentToken(chainId: number, jobId: string, token: string): number;
  /** Rows whose token has not been read yet, for the backfill, in a stable order after `after` (a row id), at most `limit`. */
  withoutPaymentToken(after?: string | null, limit?: number): HiredJob[];
  /** Cross-device funding attempts (see `hire/remote-attempts`). */
  openFundingAttempt(wallet: string, chainId: number): RemoteAttemptRow | null;
  insertFundingAttempt(row: RemoteAttemptRow): boolean;
  updateFundingAttempt(publicId: string, patch: Partial<Pick<RemoteAttemptRow, 'predictedJobId' | 'jobId' | 'callsId' | 'txHashes' | 'prompt' | 'fundableUntil' | 'verified'>>, at: string): void;
  closeFundingAttempt(publicId: string, reason: string, at: string): boolean;
  /** One line per job the currency backfill read, written or not: its audit trail. */
  auditCurrencyBackfill(entry: { runId: string; chainId: number; jobId: string; token: string | null; outcome: string; detail: string | null; at: string }): void;
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
  /* What an agent signed about the acceptance criteria, kept so a receipt
     written days later can still say whether they agreed. */
  recordCriteriaAgreement(agreement: CriteriaAgreement): void;
  criteriaAgreement(negotiationHash: string): CriteriaAgreement | null;
  noticeFor(chainId: number, jobId: string): SellerNotice | null;
  notices(): SellerNotice[];
  /**
   * The funding wallet's latest signed choice about publishing a job's
   * delivered answer (see answer-publication.ts). An older decision never
   * replaces a newer one, so a replayed signature cannot undo a later
   * choice.
   */
  recordAnswerPublication(input: { chainId: number; jobId: string; client: string; published: boolean; decidedAt: string; signature: string }): 'recorded' | 'stale';
  answerPublication(chainId: number, jobId: string): { published: boolean; decidedAt: string; client: string } | null;
  /**
   * Who owned the hired agent when the job was funded, if Pokter saw it
   * close enough to the funding to say (see owner-at-job.ts).
   *
   * Written once and never by `record()`: a job re-read later must not
   * take on whoever owns the agent by then.
   */
  recordOwnerAt(input: { id: string; owner: string; fundedAt: string; proof: OwnerProof }): void;
  /** Settled as unknown: never attributed, and never filled in later with whoever owns the agent by then. */
  markOwnerUnknown(id: string): void;
  ownerAt(id: string): JobOwner | null;
  /** Rows recorded before ownership was proven (`proof` is null), still to be proven or dropped. */
  unprovenOwners(): JobOwner[];
  proveOwner(id: string, proof: OwnerProof): void;
  dropOwner(id: string): void;
  /** Ids of the jobs whose agent this wallet provably owned at funding. */
  jobsOwnedAtFunding(owner: string): string[];
  /** When the first proven owner was recorded: jobs before it were never attributed. */
  ownerRecordsBegan(): string | null;
  /** The latest relay test of an agent: whether a brief carried the way the relay carries one was answered (relay-probe.ts). */
  recordRelayProbe(input: { chainId: number; tokenId: string; outcome: RelayProbeOutcome; detail: string }): void;
  relayProbe(chainId: number, tokenId: string): RelayProbe | null;
  /**
   * The unsigned hire requests handed to an assistant, by key.
   *
   * Kept here, beside the jobs, because the question a retry asks spans
   * both: "has this request already been funded" is answered from the job
   * index, and an answer held in a different file could be missing while
   * the job itself was there. See `lib/assistant/prepared-store`, which
   * holds the statements so they can be tested.
   */
  recordPreparedHire(write: PreparedHireWrite): 'recorded' | 'kept';
  preparedHire(key: string): PreparedHireRecord | null;
  attachPreparedHireJob(key: string, jobId: string): JobAttachment;
}

export type RelayProbeOutcome = 'answers' | 'paid-only' | 'not-askable' | 'no-answer';
export interface RelayProbe {
  outcome: RelayProbeOutcome;
  detail: string;
  at: string;
}

/** How an owner at funding was established. Only `no-transfer-since-funding` is shown; `unknown` settles a job as unattributed. */
export type OwnerProof = 'no-transfer-since-funding' | 'unknown';

export interface JobOwner {
  id: string;
  owner: string;
  fundedAt: string;
  recordedAt: string;
  proof: OwnerProof | null;
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
    client            TEXT,
    payment_token     TEXT
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

  CREATE TABLE IF NOT EXISTS criteria_agreements (
    negotiation_hash TEXT PRIMARY KEY,
    spec_hash        TEXT NOT NULL,
    sent_criteria    TEXT NOT NULL,
    signed_criteria  TEXT,
    terms_bound      INTEGER NOT NULL,
    task             TEXT NOT NULL,
    provider         TEXT NOT NULL,
    escrow_chain_id  INTEGER NOT NULL,
    quoted_at        TEXT NOT NULL
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

  CREATE TABLE IF NOT EXISTS job_owners (
    id          TEXT PRIMARY KEY,
    owner       TEXT NOT NULL,
    funded_at   TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_job_owners_owner ON job_owners (owner);

  CREATE TABLE IF NOT EXISTS funding_attempts (
    public_id        TEXT PRIMARY KEY,
    secret_hash      TEXT NOT NULL,
    wallet           TEXT NOT NULL,
    chain_id         INTEGER NOT NULL,
    provider         TEXT NOT NULL,
    description      TEXT NOT NULL,
    token            TEXT NOT NULL,
    amount_raw       TEXT NOT NULL,
    predicted_job_id TEXT,
    job_id           TEXT,
    calls_id         TEXT,
    tx_hashes        TEXT NOT NULL,
    prompt           TEXT,
    fundable_until   INTEGER,
    verified         INTEGER NOT NULL DEFAULT 0,
    state            TEXT NOT NULL,
    close_reason     TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_funding_attempts_open ON funding_attempts (wallet, chain_id, state);

  CREATE TABLE IF NOT EXISTS currency_backfill_audit (
    run_id     TEXT NOT NULL,
    chain_id   INTEGER NOT NULL,
    job_id     TEXT NOT NULL,
    token      TEXT,
    outcome    TEXT NOT NULL,
    detail     TEXT,
    at         TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS relay_probes (
    chain_id INTEGER NOT NULL,
    token_id TEXT NOT NULL,
    outcome  TEXT NOT NULL,
    detail   TEXT NOT NULL,
    at       TEXT NOT NULL,
    PRIMARY KEY (chain_id, token_id)
  );

  CREATE TABLE IF NOT EXISTS answer_publication (
    chain_id   INTEGER NOT NULL,
    job_id     TEXT NOT NULL,
    client     TEXT NOT NULL,
    published  INTEGER NOT NULL,
    decided_at TEXT NOT NULL,
    signature  TEXT NOT NULL,
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
  payment_token?: string | null;
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
    /* Null stays null: a row whose token was never read is unknown, not $U. */
    paymentToken: (row.payment_token as `0x${string}` | null | undefined) ?? null,
  };
}

interface OwnerRow {
  id: string;
  owner: string;
  funded_at: string;
  recorded_at: string;
  proof: string | null;
}

function toOwner(row: OwnerRow): JobOwner {
  return { id: row.id, owner: row.owner, fundedAt: row.funded_at, recordedAt: row.recorded_at, proof: (row.proof as OwnerProof | null) ?? null };
}

class SqliteJobStore implements JobStore {
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
      // Unknown until recorded at funding or read from the escrow; never defaulted.
      'ALTER TABLE jobs ADD COLUMN payment_token TEXT',
      // Owners recorded before this column were read, not proven, and stay hidden until proven.
      'ALTER TABLE job_owners ADD COLUMN proof TEXT',
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
    /* The assistant's prepared requests, whose statements live in their own
       module so a test can run them (see the note on the interface). */
    ensurePreparedHires(this.db);
  }

  recordPreparedHire(write: PreparedHireWrite): 'recorded' | 'kept' {
    return recordPreparedHire(this.db, write);
  }

  preparedHire(key: string): PreparedHireRecord | null {
    return readPreparedHire(this.db, key);
  }

  attachPreparedHireJob(key: string, jobId: string): JobAttachment {
    return attachPreparedHireJob(this.db, key, jobId);
  }

  record(job: HiredJob): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO jobs
           (id, job_id, chain_id, is_testnet, agent_chain_id, agent_token_id,
            agent_name, provider_label, provider, task, budget_raw, expired_at,
            hired_at, hire_tx_hash, status, status_checked_at, deliverable_url,
            settle_tx_hash, dispute_tx_hash, reclaim_tx_hash, client, payment_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 COALESCE(?, (SELECT client FROM jobs WHERE id = ?)),
                 COALESCE(?, (SELECT payment_token FROM jobs WHERE id = ?)))`,
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
        // Likewise the token: a caller that did not read it must not erase a known one.
        job.paymentToken ?? null,
        job.id,
      );
  }

  openFundingAttempt(wallet: string, chainId: number): RemoteAttemptRow | null {
    const row = this.db.prepare("SELECT * FROM funding_attempts WHERE wallet = ? AND chain_id = ? AND state = 'open' ORDER BY created_at DESC LIMIT 1").get(wallet.toLowerCase(), chainId) as Record<string, unknown> | undefined;
    return row ? toRemoteAttempt(row) : null;
  }

  /* Refused (false) while another attempt for the wallet and chain is open: one at a time, across devices. */
  insertFundingAttempt(row: RemoteAttemptRow): boolean {
    if (this.openFundingAttempt(row.wallet, row.chainId)) return false;
    this.db
      .prepare(
        `INSERT OR IGNORE INTO funding_attempts (public_id, secret_hash, wallet, chain_id, provider, description, token, amount_raw, predicted_job_id, job_id, calls_id, tx_hashes, prompt, fundable_until, verified, state, close_reason, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, ?, ?)`,
      )
      .run(row.publicId, row.secretHash, row.wallet.toLowerCase(), row.chainId, row.provider, row.description, row.token, row.amountRaw, row.predictedJobId, row.jobId, row.callsId, JSON.stringify(row.txHashes), row.prompt, row.fundableUntil, row.verified ? 1 : 0, row.createdAt, row.updatedAt);
    return this.openFundingAttempt(row.wallet, row.chainId)?.publicId === row.publicId;
  }

  updateFundingAttempt(publicId: string, patch: Partial<Pick<RemoteAttemptRow, 'predictedJobId' | 'jobId' | 'callsId' | 'txHashes' | 'prompt' | 'fundableUntil' | 'verified'>>, at: string): void {
    const sets: string[] = [];
    const args: Array<string | number | null> = [];
    const put = (column: string, value: string | number | null) => {
      sets.push(`${column} = ?`);
      args.push(value);
    };
    if (patch.predictedJobId !== undefined) put('predicted_job_id', patch.predictedJobId);
    if (patch.jobId !== undefined) put('job_id', patch.jobId);
    if (patch.callsId !== undefined) put('calls_id', patch.callsId);
    if (patch.txHashes !== undefined) put('tx_hashes', JSON.stringify(patch.txHashes));
    if (patch.prompt !== undefined) put('prompt', patch.prompt);
    if (patch.fundableUntil !== undefined) put('fundable_until', patch.fundableUntil);
    /* Verified only ever becomes true: evidence on chain is not taken back. */
    if (patch.verified) put('verified', 1);
    put('updated_at', at);
    this.db.prepare(`UPDATE funding_attempts SET ${sets.join(', ')} WHERE public_id = ? AND state = 'open'`).run(...args, publicId);
  }

  closeFundingAttempt(publicId: string, reason: string, at: string): boolean {
    return Number(this.db.prepare("UPDATE funding_attempts SET state = 'closed', close_reason = ?, updated_at = ? WHERE public_id = ? AND state = 'open'").run(reason, at, publicId).changes) === 1;
  }

  auditCurrencyBackfill(entry: { runId: string; chainId: number; jobId: string; token: string | null; outcome: string; detail: string | null; at: string }): void {
    this.db.prepare('INSERT INTO currency_backfill_audit (run_id, chain_id, job_id, token, outcome, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(entry.runId, entry.chainId, entry.jobId, entry.token, entry.outcome, entry.detail, entry.at);
  }

  setPaymentToken(chainId: number, jobId: string, token: string): number {
    return Number(
      this.db
        .prepare('UPDATE jobs SET payment_token = ? WHERE chain_id = ? AND job_id = ? AND payment_token IS NULL')
        .run(token, chainId, jobId).changes,
    );
  }

  withoutPaymentToken(after: string | null = null, limit = 100_000): HiredJob[] {
    return (this.db.prepare('SELECT * FROM jobs WHERE payment_token IS NULL AND id > ? ORDER BY id ASC LIMIT ?').all(after ?? '', limit) as unknown as JobRow[]).map(toJob);
  }

  all(): HiredJob[] {
    const rows = this.db
      .prepare('SELECT * FROM jobs ORDER BY hired_at DESC')
      .all() as unknown as JobRow[];
    // Rows whose escrow id a later hire for another agent holds were never jobs (see claimed-ids.ts).
    return oneRowPerJob(withoutClaimedIds(rows.map(toJob)));
  }

  /** Ids of rows whose escrow id belongs to another agent's later hire. */
  private phantomIds(): Set<string> {
    const rows = (this.db.prepare('SELECT * FROM jobs').all() as unknown as JobRow[]).map(toJob);
    const kept = new Set(oneRowPerJob(withoutClaimedIds(rows)).map((job) => job.id));
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

  /*
   * `INSERT OR REPLACE`, unlike the intent above.
   *
   * A hash is the agreement: it covers the task, the terms and the
   * criteria, so two rows under one hash would be two readings of one
   * signature and the later one is the one that was verified. Quoting the
   * same brief twice produces a different hash — `negotiated_at` is inside
   * it — so this does not overwrite one agreement with another.
   */
  recordCriteriaAgreement(agreement: CriteriaAgreement): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO criteria_agreements
           (negotiation_hash, spec_hash, sent_criteria, signed_criteria, terms_bound, task, provider, escrow_chain_id, quoted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        agreement.negotiationHash.toLowerCase(),
        agreement.specHash.toLowerCase(),
        JSON.stringify(agreement.sentCriteria),
        agreement.signedCriteria === null ? null : JSON.stringify(agreement.signedCriteria),
        agreement.termsBound ? 1 : 0,
        agreement.task,
        agreement.provider.toLowerCase(),
        agreement.escrowChainId,
        agreement.quotedAt,
      );
  }

  criteriaAgreement(negotiationHash: string): CriteriaAgreement | null {
    const row = this.db.prepare('SELECT * FROM criteria_agreements WHERE negotiation_hash = ?').get(negotiationHash.toLowerCase()) as
      | { negotiation_hash: string; spec_hash: string; sent_criteria: string; signed_criteria: string | null; terms_bound: number; task: string; provider: string; escrow_chain_id: number; quoted_at: string }
      | undefined;
    if (!row) return null;
    /* A row whose JSON will not parse is a row that cannot be acted on, and
       a half-read agreement must never become a binding. */
    try {
      const sent = JSON.parse(row.sent_criteria) as unknown;
      const signed = row.signed_criteria === null ? null : (JSON.parse(row.signed_criteria) as unknown);
      if (!Array.isArray(sent) || !sent.every((c) => typeof c === 'string')) return null;
      if (signed !== null && (!Array.isArray(signed) || !signed.every((c) => typeof c === 'string'))) return null;
      return {
        negotiationHash: row.negotiation_hash,
        specHash: row.spec_hash,
        sentCriteria: sent as string[],
        signedCriteria: signed as string[] | null,
        termsBound: row.terms_bound === 1,
        task: row.task,
        provider: row.provider,
        escrowChainId: row.escrow_chain_id,
        quotedAt: row.quoted_at,
      };
    } catch {
      return null;
    }
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

  recordAnswerPublication(input: { chainId: number; jobId: string; client: string; published: boolean; decidedAt: string; signature: string }): 'recorded' | 'stale' {
    const result = this.db
      .prepare(
        `INSERT INTO answer_publication (chain_id, job_id, client, published, decided_at, signature)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (chain_id, job_id) DO UPDATE SET
           client = excluded.client, published = excluded.published, decided_at = excluded.decided_at, signature = excluded.signature
         WHERE excluded.decided_at > answer_publication.decided_at`,
      )
      .run(input.chainId, input.jobId, input.client.toLowerCase(), input.published ? 1 : 0, input.decidedAt, input.signature);
    return Number(result.changes) > 0 ? 'recorded' : 'stale';
  }

  answerPublication(chainId: number, jobId: string): { published: boolean; decidedAt: string; client: string } | null {
    const row = this.db
      .prepare('SELECT published, decided_at, client FROM answer_publication WHERE chain_id = ? AND job_id = ?')
      .get(chainId, jobId) as unknown as { published: number; decided_at: string; client: string } | undefined;
    return row ? { published: row.published === 1, decidedAt: row.decided_at, client: row.client } : null;
  }

  recordOwnerAt(input: { id: string; owner: string; fundedAt: string; proof: OwnerProof }): void {
    this.db
      .prepare('INSERT OR IGNORE INTO job_owners (id, owner, funded_at, recorded_at, proof) VALUES (?, ?, ?, ?, ?)')
      .run(input.id, input.owner.toLowerCase(), input.fundedAt, new Date().toISOString(), input.proof);
  }

  markOwnerUnknown(id: string): void {
    this.db.prepare("INSERT OR IGNORE INTO job_owners (id, owner, funded_at, recorded_at, proof) VALUES (?, '', '', ?, 'unknown')").run(id, new Date().toISOString());
  }

  ownerAt(id: string): JobOwner | null {
    const row = this.db.prepare('SELECT * FROM job_owners WHERE id = ?').get(id) as OwnerRow | undefined;
    return row ? toOwner(row) : null;
  }

  unprovenOwners(): JobOwner[] {
    return (this.db.prepare('SELECT * FROM job_owners WHERE proof IS NULL ORDER BY recorded_at').all() as unknown as OwnerRow[]).map(toOwner);
  }

  proveOwner(id: string, proof: OwnerProof): void {
    this.db.prepare('UPDATE job_owners SET proof = ? WHERE id = ? AND proof IS NULL').run(proof, id);
  }

  dropOwner(id: string): void {
    this.db.prepare("UPDATE job_owners SET owner = '', proof = 'unknown' WHERE id = ?").run(id);
  }

  jobsOwnedAtFunding(owner: string): string[] {
    const rows = this.db.prepare("SELECT id FROM job_owners WHERE owner = ? AND proof = 'no-transfer-since-funding'").all(owner.toLowerCase()) as unknown as { id: string }[];
    return rows.map((row) => row.id);
  }

  ownerRecordsBegan(): string | null {
    const row = this.db.prepare("SELECT MIN(recorded_at) AS began FROM job_owners WHERE proof = 'no-transfer-since-funding'").get() as { began: string | null } | undefined;
    return row?.began ?? null;
  }

  recordRelayProbe(input: { chainId: number; tokenId: string; outcome: RelayProbeOutcome; detail: string }): void {
    this.db
      .prepare(`INSERT INTO relay_probes (chain_id, token_id, outcome, detail, at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (chain_id, token_id) DO UPDATE SET outcome = excluded.outcome, detail = excluded.detail, at = excluded.at`)
      .run(input.chainId, input.tokenId, input.outcome, input.detail.slice(0, 300), new Date().toISOString());
  }

  relayProbe(chainId: number, tokenId: string): RelayProbe | null {
    const row = this.db.prepare('SELECT outcome, detail, at FROM relay_probes WHERE chain_id = ? AND token_id = ?').get(chainId, tokenId) as
      | { outcome: RelayProbeOutcome; detail: string; at: string }
      | undefined;
    return row ?? null;
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
 * A store on a named file, outside the singleton.
 *
 * So that "it was written" can be proved by reading it back through a
 * second connection rather than out of the same object that was just
 * written to. A durability claim tested against one in-process instance
 * tests the instance.
 */
export function openJobStore(path: string): JobStore {
  return new SqliteJobStore(path);
}



function toRemoteAttempt(r: Record<string, unknown>): RemoteAttemptRow {
  return {
    publicId: String(r.public_id),
    secretHash: String(r.secret_hash),
    wallet: String(r.wallet),
    chainId: Number(r.chain_id),
    provider: String(r.provider),
    description: String(r.description),
    token: String(r.token),
    amountRaw: String(r.amount_raw),
    predictedJobId: (r.predicted_job_id as string | null) ?? null,
    jobId: (r.job_id as string | null) ?? null,
    callsId: (r.calls_id as string | null) ?? null,
    txHashes: JSON.parse(String(r.tx_hashes ?? '[]')) as string[],
    prompt: (r.prompt as string | null) ?? null,
    fundableUntil: r.fundable_until === null || r.fundable_until === undefined ? null : Number(r.fundable_until),
    verified: Number(r.verified) === 1,
    state: r.state as 'open' | 'closed',
    closeReason: (r.close_reason as string | null) ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}
