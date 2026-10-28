import type { DatabaseSync } from 'node:sqlite';

/**
 * One row per pay-per-call payment Pokter forwarded, keyed by the signed
 * authorization's own nonce.
 *
 * Its own table in its own file (`x402.db`): a direct call is not an escrow
 * job, has no review window and no dispute, and must never be counted with
 * jobs, receipts or campaign figures.
 *
 * The nonce is what stops a second payment. EIP-3009 refuses a nonce the
 * token has already used, and this table refuses to send one twice: a
 * repeat of an answered call returns the stored answer, and a repeat of a
 * call whose outcome is unknown is refused rather than resent. Pokter never
 * signs, so it never pays again on its own.
 */
export type X402CallState = 'sending' | 'answered' | 'refused' | 'unknown' | 'not-sent';

/**
 * A row still `sending` after this long is reported as unknown: the process
 * that claimed it may have restarted mid-send (a deploy restarts Pokter), and
 * "sending" forever would hide that the payment may have settled.
 */
export const X402_SENDING_STALE_MS = 90_000;

/** The state a buyer should be told, given when the row was last written. */
export function effectiveState(call: X402Call, nowMs: number): X402CallState {
  return call.state === 'sending' && nowMs - Date.parse(call.updatedAt) > X402_SENDING_STALE_MS ? 'unknown' : call.state;
}

export interface X402Call {
  nonce: string;
  state: X402CallState;
  endpoint: string;
  payTo: string;
  asset: string;
  amountRaw: string;
  network: string;
  payer: string;
  agentChainId: number;
  agentTokenId: string;
  httpStatus: number | null;
  /** The settlement transaction the seller reported, when it reported one. */
  settlementTx: string | null;
  /** The authorization's `validBefore`, in seconds; null on rows written before it was kept. */
  validBefore: number | null;
  /** What the token said about this payment when Pokter last asked it (see reconcile.ts); null until asked. */
  settlement: 'settled' | 'expired-unused' | null;
  responseText: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export const X402_RESPONSE_LIMIT = 256 * 1024;

export function ensureX402(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS x402_calls (
      nonce          TEXT PRIMARY KEY,
      state          TEXT NOT NULL,
      endpoint       TEXT NOT NULL,
      pay_to         TEXT NOT NULL,
      asset          TEXT NOT NULL,
      amount_raw     TEXT NOT NULL,
      network        TEXT NOT NULL,
      payer          TEXT NOT NULL,
      agent_chain_id INTEGER NOT NULL,
      agent_token_id TEXT NOT NULL,
      http_status    INTEGER,
      settlement_tx  TEXT,
      response_text  TEXT,
      error          TEXT,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    )
  `);
  const columns = new Set((db.prepare('PRAGMA table_info(x402_calls)').all() as Array<{ name: string }>).map((c) => c.name));
  if (!columns.has('valid_before')) db.exec('ALTER TABLE x402_calls ADD COLUMN valid_before INTEGER');
  if (!columns.has('settlement')) db.exec('ALTER TABLE x402_calls ADD COLUMN settlement TEXT');
}

type Row = Record<string, unknown>;
const toCall = (r: Row): X402Call => ({
  nonce: String(r.nonce),
  state: r.state as X402CallState,
  endpoint: String(r.endpoint),
  payTo: String(r.pay_to),
  asset: String(r.asset),
  amountRaw: String(r.amount_raw),
  network: String(r.network),
  payer: String(r.payer),
  agentChainId: Number(r.agent_chain_id),
  agentTokenId: String(r.agent_token_id),
  httpStatus: r.http_status === null ? null : Number(r.http_status),
  settlementTx: (r.settlement_tx as string | null) ?? null,
  validBefore: r.valid_before === null || r.valid_before === undefined ? null : Number(r.valid_before),
  settlement: (r.settlement as X402Call['settlement']) ?? null,
  responseText: (r.response_text as string | null) ?? null,
  error: (r.error as string | null) ?? null,
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});

export function readX402Call(db: DatabaseSync, nonce: string): X402Call | null {
  const row = db.prepare('SELECT * FROM x402_calls WHERE nonce = ?').get(nonce.toLowerCase()) as Row | undefined;
  return row ? toCall(row) : null;
}

/** Claim this nonce for one send. `existing` when it was already claimed: the caller must not send. */
export function beginX402Call(
  db: DatabaseSync,
  write: Omit<X402Call, 'state' | 'httpStatus' | 'settlementTx' | 'responseText' | 'error' | 'createdAt' | 'updatedAt' | 'validBefore' | 'settlement'> & { validBefore?: number; at: string },
): { begun: true } | { begun: false; existing: X402Call } {
  const inserted = db
    .prepare(
      `INSERT OR IGNORE INTO x402_calls (nonce, state, endpoint, pay_to, asset, amount_raw, network, payer, agent_chain_id, agent_token_id, valid_before, created_at, updated_at)
       VALUES (?, 'sending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(write.nonce.toLowerCase(), write.endpoint, write.payTo, write.asset, write.amountRaw, write.network, write.payer, write.agentChainId, write.agentTokenId, write.validBefore ?? null, write.at, write.at);
  if (Number(inserted.changes) === 1) return { begun: true };
  return { begun: false, existing: readX402Call(db, write.nonce)! };
}

/**
 * Take back a claim whose send never left Pokter, so the same authorization
 * can be sent once more. Atomic: of two retries at once, one wins and the
 * other sees the row already `sending`. Only from `not-sent`; nothing that
 * may have reached the seller is ever resent.
 */
export function reclaimNotSent(db: DatabaseSync, nonce: string, at: string): boolean {
  return Number(db.prepare("UPDATE x402_calls SET state = 'sending', error = NULL, updated_at = ? WHERE nonce = ? AND state = 'not-sent'").run(at, nonce.toLowerCase()).changes) === 1;
}

/** Record how a send ended. Only a call still `sending` changes: an outcome is written once. */
export function finishX402Call(
  db: DatabaseSync,
  nonce: string,
  outcome: { state: Exclude<X402CallState, 'sending'>; httpStatus: number | null; settlementTx: string | null; responseText: string | null; error: string | null; at: string },
): boolean {
  const text = outcome.responseText === null ? null : outcome.responseText.slice(0, X402_RESPONSE_LIMIT);
  return (
    Number(
      db
        .prepare(
          `UPDATE x402_calls SET state = ?, http_status = ?, settlement_tx = ?, response_text = ?, error = ?, updated_at = ?
           WHERE nonce = ? AND state = 'sending'`,
        )
        .run(outcome.state, outcome.httpStatus, outcome.settlementTx, text, outcome.error, outcome.at, nonce.toLowerCase()).changes,
    ) === 1
  );
}

/**
 * This wallet's earlier payments to this recipient whose outcome is not
 * settled yet: refused, unknown or still sending, and not yet resolved on
 * chain. While one remains, a new authorization to the same recipient is
 * not sent, because the earlier one may still be taken.
 */
export function unresolvedX402Calls(db: DatabaseSync, payer: string, payTo: string): X402Call[] {
  const rows = db
    .prepare(
      `SELECT * FROM x402_calls
       WHERE lower(payer) = ? AND lower(pay_to) = ? AND state IN ('sending', 'refused', 'unknown') AND settlement IS NULL
       ORDER BY created_at DESC LIMIT 10`,
    )
    .all(payer.toLowerCase(), payTo.toLowerCase()) as Row[];
  return rows.map(toCall);
}

/** Record what the token said about a payment. Written once: the chain's answer does not change back. */
export function recordX402Settlement(db: DatabaseSync, nonce: string, settlement: 'settled' | 'expired-unused', at: string): void {
  db.prepare('UPDATE x402_calls SET settlement = ?, updated_at = ? WHERE nonce = ? AND settlement IS NULL').run(settlement, at, nonce.toLowerCase());
}
