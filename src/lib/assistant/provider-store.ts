import type { DatabaseSync } from 'node:sqlite';

/**
 * The work an assistant has staged for its owner's wallet, by key.
 *
 * Separated from the stores it reads for the reason `prepared-store.ts` is:
 * those are `server-only` and cannot be imported from a test, and what has
 * to be proven here is a property of the SQL. Two calls for one proposal
 * must leave one row; two calls for one delivery must leave one row; and a
 * job whose delivery is on chain must never be stageable again. These
 * functions take the database, so the test runs the real statements against
 * a real file.
 *
 * Nothing here is a record of money or of a signature. A staged proposal is
 * unsigned and a staged deliverable is unsubmitted: both are waiting on a
 * human's wallet, and a row says only that an assistant wrote something
 * down for them.
 */

export type StagedProposalState = 'awaiting-owner-signature' | 'placed';

export interface StagedProposal {
  key: string;
  state: StagedProposalState;
  owner: string;
  requestId: string;
  agentChainId: number;
  agentTokenId: string;
  priceU: number;
  deliverDays: number;
  note: string;
  /** The bid it became, once the owner signed it. */
  bidId: string | null;
  preparedAt: string;
  lastSeenAt: string;
}

export type StagedDeliveryState = 'awaiting-wallet-signature' | 'submitted';

export interface StagedDelivery {
  key: string;
  state: StagedDeliveryState;
  owner: string;
  chainId: number;
  jobId: string;
  content: string;
  /**
   * sha256 of the staged bytes.
   *
   * **Not** the ERC-8183 deliverable hash, and deliberately not called one.
   * That hash is over a manifest which records its own `prepared_at`, so it
   * is only knowable at the moment the provider signs — `/api/builders/
   * deliveries` computes it there. Printing a hash here and calling it the
   * deliverable hash would be a number that never matches the one on chain.
   */
  contentSha256: string;
  /** The transaction the provider wallet sent, once the delivery is on chain. */
  submitTxHash: string | null;
  preparedAt: string;
  lastSeenAt: string;
}

export function ensureProviderWork(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS staged_proposals (
      key            TEXT PRIMARY KEY,
      owner          TEXT NOT NULL,
      request_id     TEXT NOT NULL,
      agent_chain_id INTEGER NOT NULL,
      agent_token_id TEXT NOT NULL,
      price_u        REAL NOT NULL,
      deliver_days   INTEGER NOT NULL,
      note           TEXT NOT NULL,
      bid_id         TEXT,
      prepared_at    TEXT NOT NULL,
      last_seen_at   TEXT NOT NULL
    );
    /* One standing offer per agent per request, which is what the bids
       table itself enforces. Without it an assistant that lost its key
       could stage a second proposal for work it had already offered. */
    CREATE UNIQUE INDEX IF NOT EXISTS idx_staged_proposals_one
      ON staged_proposals (request_id, agent_chain_id, agent_token_id, owner);
    CREATE INDEX IF NOT EXISTS idx_staged_proposals_owner
      ON staged_proposals (owner, prepared_at DESC);

    CREATE TABLE IF NOT EXISTS staged_deliveries (
      key            TEXT PRIMARY KEY,
      owner          TEXT NOT NULL,
      chain_id       INTEGER NOT NULL,
      job_id         TEXT NOT NULL,
      content        TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      submit_tx_hash TEXT,
      prepared_at    TEXT NOT NULL,
      last_seen_at   TEXT NOT NULL
    );
    /* One delivery per job, whoever staged it. A job has exactly one
       submission the escrow will accept, so a second row for it could only
       ever be a duplicate someone would pay gas to discover. */
    CREATE UNIQUE INDEX IF NOT EXISTS idx_staged_deliveries_job
      ON staged_deliveries (chain_id, job_id);
    CREATE INDEX IF NOT EXISTS idx_staged_deliveries_owner
      ON staged_deliveries (owner, prepared_at DESC);
  `);
}

interface ProposalRow {
  key: string;
  owner: string;
  request_id: string;
  agent_chain_id: number;
  agent_token_id: string;
  price_u: number;
  deliver_days: number;
  note: string;
  bid_id: string | null;
  prepared_at: string;
  last_seen_at: string;
}

function toProposal(row: ProposalRow): StagedProposal {
  return {
    key: row.key,
    state: row.bid_id ? 'placed' : 'awaiting-owner-signature',
    owner: row.owner,
    requestId: row.request_id,
    agentChainId: row.agent_chain_id,
    agentTokenId: row.agent_token_id,
    priceU: row.price_u,
    deliverDays: row.deliver_days,
    note: row.note,
    bidId: row.bid_id,
    preparedAt: row.prepared_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function readStagedProposal(db: DatabaseSync, key: string): StagedProposal | null {
  const row = db.prepare('SELECT * FROM staged_proposals WHERE key = ?').get(key) as unknown as ProposalRow | undefined;
  return row ? toProposal(row) : null;
}

export interface StagedProposalWrite {
  key: string;
  owner: string;
  requestId: string;
  agentChainId: number;
  agentTokenId: string;
  priceU: number;
  deliverDays: number;
  note: string;
  at: string;
}

/**
 * What a staging call did. `conflict` is the one worth naming separately:
 * the unique index refused the row because another key already holds this
 * request and agent, or this job. It is not a retry of the caller's own
 * work, so reporting it as one would tell an assistant its proposal was
 * already placed, or its delivery already submitted, when neither is its.
 */
export type StageOutcome = 'recorded' | 'revised' | 'already-placed' | 'conflict';

/**
 * Stage a proposal, or revise the one already there.
 *
 * Deciding and writing are one statement, so two overlapping calls cannot
 * both believe they are the first: the primary key settles it. `recorded`
 * is a first preparation and `revised` is every retry, whether or not the
 * terms moved — the caller compares the terms it read beforehand through
 * `proposalRetry` and reports which.
 *
 * A row that already names a bid is not touched. `bid_id IS NULL` in the
 * update's own `WHERE` is the guard: once the owner has signed, the terms
 * they signed are the record, and an assistant must not be able to revise
 * them out from under a proposal that is already on the request.
 *
 * `INSERT OR IGNORE` swallows a unique-index refusal as well as a primary-key
 * one, which is why the row is read back before the update rather than the
 * update's own `changes` being trusted. Both failures produce zero inserted
 * rows and they mean opposite things: one is this caller's own earlier row,
 * the other is somebody else's.
 */
export function stageProposal(db: DatabaseSync, write: StagedProposalWrite): StageOutcome {
  const inserted = db
    .prepare(
      `INSERT OR IGNORE INTO staged_proposals
         (key, owner, request_id, agent_chain_id, agent_token_id, price_u, deliver_days, note, bid_id, prepared_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .run(
      write.key,
      write.owner.toLowerCase(),
      write.requestId,
      write.agentChainId,
      write.agentTokenId,
      write.priceU,
      write.deliverDays,
      write.note,
      write.at,
      write.at,
    );
  if (Number(inserted.changes) === 1) return 'recorded';
  /* No row under this key means the unique index refused it, not that this
     caller has staged it before: a different key already holds this
     request and agent. */
  if (!readStagedProposal(db, write.key)) return 'conflict';
  const changed = db
    .prepare(
      'UPDATE staged_proposals SET price_u = ?, deliver_days = ?, note = ?, last_seen_at = ? WHERE key = ? AND bid_id IS NULL',
    )
    .run(write.priceU, write.deliverDays, write.note, write.at, write.key);
  return Number(changed.changes) === 1 ? 'revised' : 'already-placed';
}

export type ProposalAttachment = 'attached' | 'already-attached' | 'claimed-by-another-proposal' | 'no-such-proposal';

/**
 * Record which bid a staged proposal became.
 *
 * Guarded in the statement's own `WHERE`, like `attachPreparedHireJob`: a
 * row that already names a bid is not overwritten, so a duplicated or late
 * report cannot move a staged proposal from the bid it became to another.
 */
export function attachProposalBid(db: DatabaseSync, key: string, bidId: string): ProposalAttachment {
  const existing = readStagedProposal(db, key);
  if (!existing) return 'no-such-proposal';
  if (existing.bidId !== null) return existing.bidId === bidId ? 'already-attached' : 'claimed-by-another-proposal';
  const changed = db.prepare('UPDATE staged_proposals SET bid_id = ? WHERE key = ? AND bid_id IS NULL').run(bidId, key);
  return Number(changed.changes) === 1 ? 'attached' : 'already-attached';
}

/** Proposals this wallet's automation has staged, newest first. */
export function stagedProposalsFor(db: DatabaseSync, owner: string, limit = 50): StagedProposal[] {
  const rows = db
    .prepare('SELECT * FROM staged_proposals WHERE owner = ? ORDER BY prepared_at DESC LIMIT ?')
    .all(owner.toLowerCase(), limit) as unknown as ProposalRow[];
  return rows.map(toProposal);
}

interface DeliveryRow {
  key: string;
  owner: string;
  chain_id: number;
  job_id: string;
  content: string;
  content_sha256: string;
  submit_tx_hash: string | null;
  prepared_at: string;
  last_seen_at: string;
}

function toDelivery(row: DeliveryRow): StagedDelivery {
  return {
    key: row.key,
    state: row.submit_tx_hash ? 'submitted' : 'awaiting-wallet-signature',
    owner: row.owner,
    chainId: row.chain_id,
    jobId: row.job_id,
    content: row.content,
    contentSha256: row.content_sha256,
    submitTxHash: row.submit_tx_hash,
    preparedAt: row.prepared_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function readStagedDelivery(db: DatabaseSync, key: string): StagedDelivery | null {
  const row = db.prepare('SELECT * FROM staged_deliveries WHERE key = ?').get(key) as unknown as DeliveryRow | undefined;
  return row ? toDelivery(row) : null;
}

/**
 * The delivery staged for one job, whoever staged it.
 *
 * Read by key everywhere except here. A job is one job: if another wallet's
 * automation has already staged its delivery, that is the thing to report
 * rather than a second row the unique index would refuse anyway.
 */
export function stagedDeliveryForJob(db: DatabaseSync, chainId: number, jobId: string): StagedDelivery | null {
  const row = db
    .prepare('SELECT * FROM staged_deliveries WHERE chain_id = ? AND job_id = ?')
    .get(chainId, jobId) as unknown as DeliveryRow | undefined;
  return row ? toDelivery(row) : null;
}

export interface StagedDeliveryWrite {
  key: string;
  owner: string;
  chainId: number;
  jobId: string;
  content: string;
  contentSha256: string;
  at: string;
}

/**
 * Stage a deliverable, or replace the unsigned one already there.
 *
 * `submit_tx_hash IS NULL` in the update's `WHERE` is the guard that stops
 * a job being delivered twice at this layer. Once a transaction is
 * recorded, nothing here can overwrite the bytes it committed to — the
 * hosted manifest has to keep matching the hash on chain, and a replaced
 * body would break that for good.
 *
 * `conflict` is reachable here in a way it barely is for proposals: the
 * index is on the job alone, where the key carries the owner too, so two
 * wallets' automation staging one job land on it. One job has one delivery,
 * and the second caller is told that rather than told its own delivery was
 * submitted.
 */
export function stageDelivery(db: DatabaseSync, write: StagedDeliveryWrite): 'recorded' | 'restaged' | 'already-submitted' | 'conflict' {
  const inserted = db
    .prepare(
      `INSERT OR IGNORE INTO staged_deliveries
         (key, owner, chain_id, job_id, content, content_sha256, submit_tx_hash, prepared_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .run(
      write.key,
      write.owner.toLowerCase(),
      write.chainId,
      write.jobId,
      write.content,
      write.contentSha256,
      write.at,
      write.at,
    );
  if (Number(inserted.changes) === 1) return 'recorded';
  /* No row under this key: the index refused it because another key — in
     practice, another wallet's automation — already holds this job. */
  if (!readStagedDelivery(db, write.key)) return 'conflict';
  const changed = db
    .prepare(
      'UPDATE staged_deliveries SET content = ?, content_sha256 = ?, last_seen_at = ? WHERE key = ? AND submit_tx_hash IS NULL',
    )
    .run(write.content, write.contentSha256, write.at, write.key);
  return Number(changed.changes) === 1 ? 'restaged' : 'already-submitted';
}

/**
 * Drop a staged delivery that was never submitted, so the job's one slot can
 * be taken by whoever now owns the agent. A submitted row is never touched:
 * its bytes are what the chain committed to. True when a row was removed.
 */
export function releaseStagedDelivery(db: DatabaseSync, key: string): boolean {
  return Number(db.prepare('DELETE FROM staged_deliveries WHERE key = ? AND submit_tx_hash IS NULL').run(key).changes) === 1;
}

export type DeliveryAttachment = 'attached' | 'already-attached' | 'no-such-delivery';

/** Record the transaction the provider wallet sent. Never overwritten, for the reason above. */
export function attachDeliverySubmission(db: DatabaseSync, key: string, transactionHash: string): DeliveryAttachment {
  const existing = readStagedDelivery(db, key);
  if (!existing) return 'no-such-delivery';
  if (existing.submitTxHash !== null) return 'already-attached';
  const changed = db
    .prepare('UPDATE staged_deliveries SET submit_tx_hash = ? WHERE key = ? AND submit_tx_hash IS NULL')
    .run(transactionHash, key);
  return Number(changed.changes) === 1 ? 'attached' : 'already-attached';
}

/** Deliveries this wallet's automation has staged, newest first. */
export function stagedDeliveriesFor(db: DatabaseSync, owner: string, limit = 50): StagedDelivery[] {
  const rows = db
    .prepare('SELECT * FROM staged_deliveries WHERE owner = ? ORDER BY prepared_at DESC LIMIT ?')
    .all(owner.toLowerCase(), limit) as unknown as DeliveryRow[];
  return rows.map(toDelivery);
}
