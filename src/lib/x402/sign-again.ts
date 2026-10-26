import type { CallOutcome } from './call';

export type Receipt = {
  state: string;
  settlementTx: string | null;
  httpStatus: number | null;
  /** What the token says about the payment (see reconcile.ts); null for an answered call. */
  settlement?: 'settled' | 'expired-unused' | 'may-still-settle' | 'unread' | null;
  validBefore?: number;
  responseText?: string | null;
  error?: string | null;
};
export type ReceiptView = { kind: 'idle' } | { kind: 'checking' } | { kind: 'missing' } | { kind: 'seen'; receipt: Receipt } | { kind: 'failed'; reason: string };

/*
 * Whether the buyer may sign again. Only when nothing can have been taken:
 * Pokter refused before sending, or never sent it, or the token itself says
 * the payment was not used and can no longer be. A seller's reply is never
 * enough, a refusal included: a seller can take the payment and answer an
 * error. The server keeps the same rule, so a reloaded page cannot skip it.
 *
 * `validBefore` is the authorization this page signed, in seconds.
 */
export function maySignAgain(outcome: CallOutcome | { kind: 'lost' }, receipt: ReceiptView, nowSeconds: number, validBefore: number | null): boolean {
  if (outcome.kind === 'invalid' || outcome.kind === 'unavailable' || outcome.kind === 'not-sent') return true;
  if (outcome.kind === 'unresolved') return outcome.earlier.settlement === 'settled' || nowSeconds >= outcome.earlier.validBefore;
  /* Pokter holds no record of it. Once it has expired it can never be taken, whoever holds it. */
  if (receipt.kind === 'missing') return validBefore !== null && nowSeconds >= validBefore;
  if (receipt.kind === 'seen') return receipt.receipt.state === 'not-sent' || receipt.receipt.settlement === 'expired-unused';
  return false;
}
