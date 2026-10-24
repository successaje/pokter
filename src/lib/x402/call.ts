import type { DatabaseSync } from 'node:sqlite';

import { authorizationMismatch, changedTerms, readPaymentHeader, type X402Choice, type X402Terms } from './exact';
import { beginX402Call, finishX402Call, readX402Call, type X402Call } from './receipts';

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
 *   4. Only then is the request sent, once, and its outcome recorded.
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
  | { kind: 'already-sent'; call: X402Call }
  | { kind: 'terms-changed'; reason: string; fresh: X402Terms }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'invalid'; reason: string };

export interface SentResponse {
  status: number;
  headers: Headers;
  text: string;
}

const SETTLEMENT_HEADERS = ['payment-response', 'x-payment-response'];

/** The settlement transaction a seller reported, when its response header says one. */
export function settlementTransaction(headers: Headers): string | null {
  for (const name of SETTLEMENT_HEADERS) {
    const raw = headers.get(name);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as { transaction?: unknown };
      if (typeof parsed.transaction === 'string' && /^0x[0-9a-fA-F]{64}$/.test(parsed.transaction)) return parsed.transaction;
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
  const mismatch = authorizationMismatch(fresh.terms, signed.authorization, nowSeconds);
  if (mismatch) return { kind: 'invalid', reason: mismatch };

  const at = new Date(now).toISOString();
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
    at,
  });
  if (!claim.begun) {
    if (claim.existing.state === 'answered') return { kind: 'answered', call: claim.existing, replayed: true };
    return { kind: 'already-sent', call: claim.existing };
  }

  let response: SentResponse;
  try {
    response = await input.send({ [expectedHeader]: input.header.value, 'content-type': 'application/json', accept: 'application/json' }, input.body);
  } catch (error) {
    const reason =
      'The request was sent but no answer came back, so Pokter does not know whether the seller settled the payment. Do not pay again: check this receipt later, or the token transfer on chain.';
    finishX402Call(input.db, signed.authorization.nonce, { state: 'unknown', httpStatus: null, settlementTx: null, responseText: null, error: `${reason} (${error instanceof Error ? error.message.slice(0, 120) : 'no detail'})`, at: new Date().toISOString() });
    return { kind: 'unknown', call: readX402Call(input.db, signed.authorization.nonce)! };
  }
  const settlementTx = settlementTransaction(response.headers);
  const answered = response.status >= 200 && response.status < 300;
  finishX402Call(input.db, signed.authorization.nonce, {
    state: answered ? 'answered' : 'refused',
    httpStatus: response.status,
    settlementTx,
    responseText: response.text,
    error: answered
      ? null
      : response.status === 402
        ? 'The seller refused the payment. Its own message is below; it says whether anything was taken.'
        : `The seller answered HTTP ${response.status}.${settlementTx ? ' It reported a settlement transaction, so the payment may have been taken.' : ''}`,
    at: new Date().toISOString(),
  });
  const call = readX402Call(input.db, signed.authorization.nonce)!;
  return answered ? { kind: 'answered', call, replayed: false } : { kind: 'refused', call };
}
