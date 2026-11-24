import { getAddress, isAddress, type Address } from 'viem';

import { changeChoiceTypedData, chooseTypedData, withdrawTypedData, type DecisionTypedData } from './decision-typed';
import type { Bid, Brief } from './model';
import { fundsAboveBudget } from './proposal-price';

/**
 * The decision a request's poster signs, as typed data, for a wallet that
 * signs nothing else: choose a proposal, take that choice back, or
 * withdraw the request. Refused here, in the words the deciding route
 * would use, when that route would refuse it anyway, so the poster is not
 * asked to approve a signature that cannot count.
 *
 * The answer says where the signature goes and with what: the routes the
 * browser uses, with `format: 'eip712'`. Nothing is recorded until then.
 */

export type DecisionAction = 'choose' | 'change' | 'withdraw';

export interface DecisionToSign {
  ok: true;
  action: DecisionAction;
  typed: DecisionTypedData;
  /** Where the signed decision goes, and the body to send it with, before the signature is added. */
  submit: { path: string; body: Record<string, string> };
  /** A change of choice is dated, and counts only for ten minutes; null for the others, which are not. */
  signBy: string | null;
}

export type DecisionRefusal = { ok: false; status: number; error: string };

/** How long a dated decision counts for (`decisionIsFresh`). */
const DECISION_MAX_AGE_MS = 10 * 60_000;

export function decisionToSign(
  brief: Brief,
  bids: readonly Bid[],
  input: { action: unknown; wallet: unknown; bidId?: unknown },
  deps: { hired: (brief: Brief, bids: readonly Bid[]) => boolean; now?: number },
): DecisionToSign | DecisionRefusal {
  const action = input.action === 'choose' || input.action === 'change' || input.action === 'withdraw' ? input.action : null;
  if (!action || typeof input.wallet !== 'string' || !isAddress(input.wallet, { strict: false })) {
    return { ok: false, status: 400, error: 'action ("choose", "change" or "withdraw") and wallet are required; bidId too, to choose.' };
  }
  const poster: Address = getAddress(brief.poster);
  if (getAddress(input.wallet) !== poster) return { ok: false, status: 403, error: 'Only the wallet that posted this request can decide on it.' };

  if (action === 'choose') {
    if (brief.state !== 'open') return { ok: false, status: 409, error: 'This request is not open, so no proposal can be chosen. If one is chosen already, take that choice back first.' };
    const bid = bids.find((b) => b.id === input.bidId);
    if (!bid) return { ok: false, status: 400, error: 'That proposal is not on this request.' };
    return {
      ok: true,
      action,
      typed: chooseTypedData(brief.id, bid.id, poster, fundsAboveBudget(bid, brief)),
      submit: { path: `/api/briefs/${brief.id}/award`, body: { bidId: bid.id, format: 'eip712' } },
      signBy: null,
    };
  }

  if (action === 'change') {
    if (brief.state !== 'awarded' || !brief.awardedBidId) return { ok: false, status: 409, error: 'No proposal is chosen on this request.' };
    if (deps.hired(brief, bids)) return { ok: false, status: 409, error: 'The chosen proposal has a funded job, so the choice can no longer be changed. If it is refunded, choose again.' };
    const now = deps.now ?? Date.now();
    const decidedAt = new Date(now).toISOString();
    return {
      ok: true,
      action,
      typed: changeChoiceTypedData(brief.id, brief.awardedBidId, poster, decidedAt),
      submit: { path: `/api/briefs/${brief.id}/reopen`, body: { decidedAt, format: 'eip712' } },
      signBy: new Date(now + DECISION_MAX_AGE_MS).toISOString(),
    };
  }

  if (brief.state !== 'open') return { ok: false, status: 409, error: 'Only an open request can be withdrawn.' };
  return { ok: true, action, typed: withdrawTypedData(brief.id, poster), submit: { path: `/api/briefs/${brief.id}/withdraw`, body: { format: 'eip712' } }, signBy: null };
}
