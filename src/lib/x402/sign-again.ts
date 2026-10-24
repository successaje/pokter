import type { CallOutcome } from './call';

export type Receipt = { state: string; settlementTx: string | null; httpStatus: number | null; responseText?: string | null; error?: string | null };
export type ReceiptView = { kind: 'idle' } | { kind: 'checking' } | { kind: 'missing' } | { kind: 'seen'; receipt: Receipt } | { kind: 'failed'; reason: string };

/*
 * Whether the buyer may sign again. Only when nothing can have been taken:
 * Pokter refused before sending, the seller refused and reported no
 * settlement, or Pokter never received the request at all. An unknown
 * outcome never offers a second signature: that would be a second payment.
 */
export function maySignAgain(outcome: CallOutcome | { kind: 'lost' }, receipt: ReceiptView): boolean {
  if (outcome.kind === 'invalid' || outcome.kind === 'unavailable' || outcome.kind === 'not-sent') return true;
  if (outcome.kind === 'refused') return !outcome.call.settlementTx;
  if (receipt.kind === 'missing') return true;
  if (receipt.kind === 'seen') return receipt.receipt.state === 'not-sent' || (receipt.receipt.state === 'refused' && !receipt.receipt.settlementTx);
  return false;
}

