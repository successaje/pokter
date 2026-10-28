import type { DatabaseSync } from 'node:sqlite';

import { changedTerms, paymentHeaderProblem, readPaymentHeader, type X402Choice, type X402Terms } from './exact';
import { beginX402Call, effectiveState, finishX402Call, readX402Call, reclaimNotSent, recordX402Settlement, unresolvedX402Calls, type X402Call } from './receipts';
import { latestValidBefore, settlementOf, type ReadAuthorization } from './reconcile';

/**
 * One paid call, from a buyer's signed authorization to the seller's answer.
 *
 * The order is the protection:
 *   1. The challenge is read again, fresh. A recipient, price, token or
 *      network that differs from what the buyer agreed to stops the call:
 *      nothing is sent, and the buyer is shown the new terms.
 *   2. The signed authorization must pay exactly those terms, and must not
 *      have expired.
 *   3. The authorization's nonce is claimed. A nonce already claimed is
 *      never sent again: an answered call returns the stored answer, any
 *      other is refused with what is known about it.
 *   4. A new authorization is not sent while this wallet has an earlier
 *      payment to the same recipient whose outcome is unresolved. The token
 *      is asked whether that one was taken; only once it was, or can no
 *      longer be, does a new one go out.
 *   5. Only then is the request sent, once, and its outcome recorded.
 *
 * Only a 2xx is an answer, and only a 402 with no settlement reported is a
 * refusal. Any other reply (a 500, a 404, a 402 that names a transaction)
 * does not say whether the seller took the payment, so it is `unknown`.
 *
 * A send that fails without an answer is `unknown`, never "failed": the
 * seller may have settled the payment and lost the reply. Pokter says so,
 * keeps the receipt, and does not pay again; there is no refund to promise,
 * because the seller, not Pokter, holds the money.
 */
export type CallOutcome =
  | { kind: 'answered'; call: X402Call; replayed: boolean }
  | { kind: 'refused'; call: X402Call }
  | { kind: 'unknown'; call: X402Call }
  | { kind: 'not-sent'; call: X402Call }
  /** Claimed by another request that is still sending. Wait, then check the receipt; do not sign again. */
  | { kind: 'in-flight'; call: X402Call }
  /** An earlier payment from this wallet to this seller is not resolved yet. Nothing was sent. */
  | { kind: 'unresolved'; reason: string; earlier: { nonce: string; settlement: 'settled' | 'may-still-settle' | 'unread'; validBefore: number } }
  | { kind: 'terms-changed'; reason: string; fresh: X402Terms }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'invalid'; reason: string };

export interface SentResponse {
  status: number;
  headers: Headers;
  text: string;
}

const SETTLEMENT_HEADERS = ['payment-response', 'x-payment-response'];

/**
 * Thrown by a sender that refused before any request left Pokter (a DNS
 * answer that changed, a private address): nothing reached the seller, so
 * the authorization was not spent and the buyer may sign again.
 */
export class X402NotSentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'X402NotSentError';
  }
}

const TX = /^0x[0-9a-fA-F]{64}$/;

/**
 * The settlement transaction a seller reported: in its x402 response header,
 * or, as some sellers do, as `tx` or `transaction` at the top of a JSON body.
 */
export function settlementTransaction(headers: Headers, text: string | null = null): string | null {
  if (text) {
    try {
      const body = JSON.parse(text) as Record<string, unknown>;
      for (const key of ['tx', 'transaction']) if (typeof body?.[key] === 'string' && TX.test(body[key] as string)) return body[key] as string;
    } catch {
      /* Not JSON: only the headers can say. */
    }
  }
  for (const name of SETTLEMENT_HEADERS) {
    const raw = headers.get(name);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as { transaction?: unknown };
      if (typeof parsed.transaction === 'string' && TX.test(parsed.transaction)) return parsed.transaction;
    } catch {
      /* A header that does not decode reports nothing. */
    }
  }
  return null;
}

export async function runX402Call(input: {
  db: DatabaseSync;
  agreed: X402Terms;
  agent: { chainId: number; tokenId: string };
  header: { name: string; value: string };
  body: string;
  readFresh: () => Promise<X402Choice>;
  send: (headers: Record<string, string>, body: string) => Promise<SentResponse>;
  /** Asks the token whether an authorization was used; see reconcile.ts. */
  readAuthorization: ReadAuthorization;
  nowMs?: number;
}): Promise<CallOutcome> {
  const now = input.nowMs ?? Date.now();
  const nowSeconds = Math.floor(now / 1000);

  let fresh: X402Choice;
  try {
    fresh = await input.readFresh();
  } catch {
    return { kind: 'unavailable', reason: 'The seller could not be reached to confirm its terms, so nothing was sent and nothing was paid.' };
  }
  if (!fresh.ok) return { kind: 'unavailable', reason: `${fresh.reason} Nothing was sent and nothing was paid.` };
  const changed = changedTerms(input.agreed, fresh.terms);
  if (changed) return { kind: 'terms-changed', reason: `${changed} Nothing was sent. Review the new terms before authorizing again.`, fresh: fresh.terms };

  const expectedHeader = fresh.terms.version === 2 ? 'PAYMENT-SIGNATURE' : 'X-PAYMENT';
  if (input.header.name !== expectedHeader) return { kind: 'invalid', reason: `This seller speaks x402 version ${fresh.terms.version}, so the payment goes in ${expectedHeader}.` };
  const signed = readPaymentHeader(input.header.value);
  if (!signed) return { kind: 'invalid', reason: 'The payment header could not be read.' };
  const problem = await paymentHeaderProblem(fresh.terms, signed, nowSeconds);
  if (problem) return { kind: 'invalid', reason: problem };

  const at = new Date(now).toISOString();
  if (!readX402Call(input.db, signed.authorization.nonce)) {
    const blocked = await earlierUnresolved(input.db, input.readAuthorization, signed.authorization.from, fresh.terms.payTo, now);
    if (blocked) return blocked;
  }
  const claim = beginX402Call(input.db, {
    nonce: signed.authorization.nonce,
    endpoint: fresh.terms.endpoint,
    payTo: fresh.terms.payTo,
    asset: fresh.terms.asset,
    amountRaw: fresh.terms.amountRaw,
    network: fresh.terms.network,
    payer: signed.authorization.from,
    agentChainId: input.agent.chainId,
    agentTokenId: input.agent.tokenId,
    validBefore: Number(signed.authorization.validBefore),
    at,
  });
  if (!claim.begun) {
    /*
     * The same authorization again. Said as exactly what happened to it,
     * never as a generic "already sent": that phrase read the same for a
     * call that was answered, refused, lost or never sent at all.
     */
    const existing = claim.existing;
    const state = effectiveState(existing, now);
    if (state === 'answered') return { kind: 'answered', call: existing, replayed: true };
    if (state === 'refused') return { kind: 'refused', call: existing };
    if (state === 'unknown') return { kind: 'unknown', call: { ...existing, state } };
    if (state === 'sending') return { kind: 'in-flight', call: existing };
    /* `not-sent`: it never reached the seller, so it may be sent once more, if no other retry took it first. */
    if (!reclaimNotSent(input.db, existing.nonce, at)) {
      const now2 = readX402Call(input.db, existing.nonce)!;
      return { kind: 'in-flight', call: now2 };
    }
  }

  let response: SentResponse;
  try {
    response = await input.send({ [expectedHeader]: input.header.value, 'content-type': 'application/json', accept: 'application/json' }, input.body);
  } catch (error) {
    if (error instanceof X402NotSentError) {
      finishX402Call(input.db, signed.authorization.nonce, { state: 'not-sent', httpStatus: null, settlementTx: null, responseText: null, error: `Nothing was sent: ${error.message}`, at: new Date().toISOString() });
      return { kind: 'not-sent', call: readX402Call(input.db, signed.authorization.nonce)! };
    }
    const reason =
      'The request was sent but no answer came back, so Pokter does not know whether the seller settled the payment. Do not pay again: check this receipt later, or the token transfer on chain.';
    finishX402Call(input.db, signed.authorization.nonce, { state: 'unknown', httpStatus: null, settlementTx: null, responseText: null, error: `${reason} (${error instanceof Error ? error.message.slice(0, 120) : 'no detail'})`, at: new Date().toISOString() });
    return { kind: 'unknown', call: readX402Call(input.db, signed.authorization.nonce)! };
  }
  const settlementTx = settlementTransaction(response.headers, response.text);
  const state = classifyReply(response.status, settlementTx);
  finishX402Call(input.db, signed.authorization.nonce, {
    state,
    httpStatus: response.status,
    settlementTx,
    responseText: response.text,
    error:
      state === 'answered'
        ? null
        : state === 'refused'
          ? 'The seller refused the payment and reported no settlement. Pokter checks the token before this wallet can pay this seller again.'
          : `The seller answered HTTP ${response.status}${settlementTx ? ' and reported a settlement transaction' : ''}, which does not say whether it took the payment. Do not pay again: check this receipt, which asks the token on chain.`,
    at: new Date().toISOString(),
  });
  const call = readX402Call(input.db, signed.authorization.nonce)!;
  return state === 'answered' ? { kind: 'answered', call, replayed: false } : state === 'refused' ? { kind: 'refused', call } : { kind: 'unknown', call };
}

/** Only a 2xx is an answer, and only a 402 with no settlement reported is a refusal. Everything else is unknown. */
export function classifyReply(status: number, settlementTx: string | null): 'answered' | 'refused' | 'unknown' {
  if (status >= 200 && status < 300) return 'answered';
  if (status === 402 && !settlementTx) return 'refused';
  return 'unknown';
}

const clock = (seconds: number) => new Date(seconds * 1000).toISOString().slice(11, 16) + ' UTC';

/**
 * The first earlier payment from this wallet to this recipient that keeps a
 * new one from being sent, resolving on chain each one the token can settle.
 * A chain that cannot be read keeps it blocked: unknown is never "unpaid".
 */
async function earlierUnresolved(db: DatabaseSync, read: ReadAuthorization, payer: string, payTo: string, now: number): Promise<CallOutcome | null> {
  for (const earlier of unresolvedX402Calls(db, payer, payTo)) {
    const validBefore = latestValidBefore(earlier);
    const ref = `${earlier.nonce.slice(0, 10)}…`;
    if (effectiveState(earlier, now) === 'sending') {
      return { kind: 'unresolved', reason: `An earlier payment from this wallet to this seller (${ref}) is still being sent. Nothing was sent now; wait, then check its receipt.`, earlier: { nonce: earlier.nonce, settlement: 'unread', validBefore } };
    }
    let settlement;
    try {
      settlement = settlementOf(earlier, await read(earlier.payer, earlier.nonce));
    } catch {
      return { kind: 'unresolved', reason: `Pokter could not ask the token whether an earlier payment from this wallet (${ref}) was taken. Nothing was sent now; try again shortly.`, earlier: { nonce: earlier.nonce, settlement: 'unread', validBefore } };
    }
    const at = new Date(now).toISOString();
    if (settlement === 'expired-unused') {
      recordX402Settlement(db, earlier.nonce, 'expired-unused', at);
      continue;
    }
    if (settlement === 'settled') {
      recordX402Settlement(db, earlier.nonce, 'settled', at);
      return { kind: 'unresolved', reason: `Your earlier payment to this seller (${ref}) was taken on chain, though Pokter did not receive an answer for it. Nothing was sent now. Check that receipt; if you still want a new answer, sign again and it will be sent.`, earlier: { nonce: earlier.nonce, settlement, validBefore } };
    }
    return { kind: 'unresolved', reason: `Your earlier payment to this seller (${ref}) could still be taken until ${clock(validBefore)}. Nothing was sent now; after then, Pokter checks the token and a new payment can go.`, earlier: { nonce: earlier.nonce, settlement, validBefore } };
  }
  return null;
}
