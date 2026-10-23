import type { DatabaseSync } from 'node:sqlite';

/**
 * The prepared requests an assistant has been handed, by key.
 *
 * Separated from `erc8183/store` for the reason `trading/owner-list` and
 * `history/stats-query` are: that store is `server-only` and cannot be
 * imported from a test, and what has to be proven here — that two calls for
 * one purchase produce one row, and that a funded job can be claimed by one
 * key only — is a property of the SQL, not of the types around it. These
 * functions take the database so a test can run the real statements against
 * a real file.
 *
 * It lives in the jobs database, beside the jobs it leads to, because the
 * reconciliation question is asked across both: "is there already a job for
 * this request" is answered from the job index, and an answer that lived in
 * a different file could be missing while the job was there.
 *
 * The table is the idempotency guarantee. It is not a record of money: an
 * unsigned request has moved nothing, and a row here says only that one was
 * prepared and, once the owner has approved it, which job it became.
 */

export type PreparedHireState = 'awaiting-owner-approval' | 'funded';

export interface PreparedHireRecord {
  key: string;
  state: PreparedHireState;
  agentChainId: number;
  agentTokenId: string;
  /** The escrow chain. */
  chainId: number;
  escrow: string;
  provider: string;
  token: string;
  amountRaw: string;
  task: string;
  /** The wallet expected to approve it, where the owner said who they are. */
  owner: string | null;
  /** The prepared request, exactly as it was first returned. */
  request: string;
  /** The job it became, once the owner funded it. */
  jobId: string | null;
  preparedAt: string;
  lastSeenAt: string;
}

export interface PreparedHireWrite {
  key: string;
  agentChainId: number;
  agentTokenId: string;
  chainId: number;
  escrow: string;
  provider: string;
  token: string;
  amountRaw: string;
  task: string;
  request: string;
  owner?: string | null;
  at: string;
}

export function ensurePreparedHires(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prepared_hires (
      key            TEXT PRIMARY KEY,
      agent_chain_id INTEGER NOT NULL,
      agent_token_id TEXT NOT NULL,
      chain_id       INTEGER NOT NULL,
      escrow         TEXT NOT NULL,
      provider       TEXT NOT NULL,
      token          TEXT NOT NULL,
      amount_raw     TEXT NOT NULL,
      task           TEXT NOT NULL,
      request        TEXT NOT NULL,
      owner          TEXT,
      job_id         TEXT,
      prepared_at    TEXT NOT NULL,
      last_seen_at   TEXT NOT NULL
    );
  `);
  /* `CREATE TABLE IF NOT EXISTS` adds no column to a table that already
     exists, so a database written by an earlier build of this branch keeps
     its rows and gains the column. The same migration shape the job store
     uses, and tolerant of having already run. */
  try {
    db.exec('ALTER TABLE prepared_hires ADD COLUMN owner TEXT');
  } catch (error) {
    if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) throw error;
  }
  /*
   * One key per job. SQLite allows any number of NULLs in a unique index,
   * so every request still awaiting approval coexists, and the first key to
   * claim a funded job is the only one that can: a second key claiming the
   * same job would be two purchases recorded against one payment.
   */
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_prepared_hires_job ON prepared_hires (chain_id, job_id)');
}

interface Row {
  key: string;
  agent_chain_id: number;
  agent_token_id: string;
  chain_id: number;
  escrow: string;
  provider: string;
  token: string;
  amount_raw: string;
  task: string;
  request: string;
  owner: string | null;
  job_id: string | null;
  prepared_at: string;
  last_seen_at: string;
}

function toRecord(row: Row): PreparedHireRecord {
  return {
    key: row.key,
    state: row.job_id ? 'funded' : 'awaiting-owner-approval',
    agentChainId: row.agent_chain_id,
    agentTokenId: row.agent_token_id,
    chainId: row.chain_id,
    escrow: row.escrow,
    provider: row.provider,
    token: row.token,
    amountRaw: row.amount_raw,
    task: row.task,
    request: row.request,
    owner: row.owner ?? null,
    jobId: row.job_id,
    preparedAt: row.prepared_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function readPreparedHire(db: DatabaseSync, key: string): PreparedHireRecord | null {
  const row = db.prepare('SELECT * FROM prepared_hires WHERE key = ?').get(key) as unknown as Row | undefined;
  return row ? toRecord(row) : null;
}

/**
 * Record a prepared request, or keep the one already there.
 *
 * `recorded` is a first preparation; `kept` is every retry of it. Deciding
 * and writing are one statement, so two calls that overlap cannot both
 * believe they are the first — the primary key settles it, and the loser
 * reads back the winner's row. A JavaScript check around the insert would
 * leave exactly the gap that produces two requests for one purchase.
 *
 * The stored request is never overwritten, and that is what the row is for:
 * the price is deliberately not part of the key, so a retry can be answered
 * at a different number under the same key. The first offer stays here to
 * be compared with the current one — `/api/hire/prepare` returns the fresh
 * request, because a stale expiry would send an owner to approve a price
 * that has lapsed, and reports this row's amount beside it. What a caller
 * must not be able to do is quote one figure to a human and hand over
 * another under the same key without either of them being told.
 */
export function recordPreparedHire(db: DatabaseSync, write: PreparedHireWrite): 'recorded' | 'kept' {
  const inserted = db
    .prepare(
      `INSERT OR IGNORE INTO prepared_hires
         (key, agent_chain_id, agent_token_id, chain_id, escrow, provider, token, amount_raw, task, request, owner, job_id, prepared_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .run(
      write.key,
      write.agentChainId,
      write.agentTokenId,
      write.chainId,
      write.escrow.toLowerCase(),
      write.provider.toLowerCase(),
      write.token.toLowerCase(),
      write.amountRaw,
      write.task,
      write.request,
      write.owner ? write.owner.toLowerCase() : null,
      write.at,
      write.at,
    );
  if (Number(inserted.changes) === 1) return 'recorded';
  /* Somebody else's row, or this caller's own earlier one. Theirs stands;
     this records only that it was asked for again. */
  db.prepare('UPDATE prepared_hires SET last_seen_at = ? WHERE key = ?').run(write.at, write.key);
  return 'kept';
}

/**
 * Whether a funded job really is this prepared request's, or why not.
 *
 * The key travels to the owner's wallet in the approval link and comes back
 * from the browser that funded it, so it arrives as a claim. It is only ever
 * a claim and never a capability: it is a hash of the terms, so anyone who
 * knows them can derive it, and nothing is granted by holding one. All of
 * the weight is carried here, deliberately.
 *
 * What makes the claim safe is this: the job has to be the one the request
 * describes —
 * same escrow chain, same agent registration, same provider, the exact
 * brief, and funded by the owner the request was prepared for where it
 * named one. A key paired with somebody else's job matches nothing and
 * attaches nothing.
 *
 * Pure, and returns the reason rather than a boolean, because "this job is
 * not that request's" is something an operator reading a log needs told.
 */
export function preparedHireMismatch(
  record: PreparedHireRecord,
  job: { chainId: number; agentChainId: number; agentTokenId: string; provider: string; task: string; client: string },
): string | null {
  if (record.chainId !== job.chainId) return `the request is for escrow chain ${record.chainId} and the job is on ${job.chainId}`;
  if (record.agentChainId !== job.agentChainId || record.agentTokenId !== job.agentTokenId) {
    return `the request is for agent ${record.agentChainId}/${record.agentTokenId} and the job is for ${job.agentChainId}/${job.agentTokenId}`;
  }
  if (record.provider.toLowerCase() !== job.provider.toLowerCase()) return 'the job pays a different provider';
  if (record.task !== job.task) return 'the job was funded with a different brief';
  /* Where the request named an owner, only that owner's funding is it. A
     request prepared without one cannot be compared and is matched on the
     work alone, as the index is. */
  if (record.owner && record.owner.toLowerCase() !== job.client.toLowerCase()) return 'the job was funded by a different wallet';
  return null;
}

export type JobAttachment = 'attached' | 'already-attached' | 'claimed-by-another-request' | 'no-such-request';

/**
 * Record which job a prepared request became.
 *
 * Guarded in the statement's own `WHERE`, like `recordSignedOwners`: a row
 * that already names a job is not overwritten, so a late or duplicated
 * report cannot move a request from the job it funded to another one.
 */
export function attachPreparedHireJob(db: DatabaseSync, key: string, jobId: string): JobAttachment {
  const existing = readPreparedHire(db, key);
  if (!existing) return 'no-such-request';
  if (existing.jobId !== null) return existing.jobId === jobId ? 'already-attached' : 'claimed-by-another-request';
  try {
    const result = db
      .prepare('UPDATE prepared_hires SET job_id = ? WHERE key = ? AND job_id IS NULL')
      .run(jobId, key);
    return Number(result.changes) === 1 ? 'attached' : 'already-attached';
  } catch {
    /* The unique index refused it: this job is another key's purchase. */
    return 'claimed-by-another-request';
  }
}

/** Requests still waiting on an owner, oldest first, for a reconciliation pass. */
export function preparedHiresAwaitingApproval(db: DatabaseSync, limit = 100): PreparedHireRecord[] {
  const rows = db
    .prepare('SELECT * FROM prepared_hires WHERE job_id IS NULL ORDER BY prepared_at ASC LIMIT ?')
    .all(limit) as unknown as Row[];
  return rows.map(toRecord);
}
