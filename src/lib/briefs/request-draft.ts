import { requestCategoryOf, type Brief, type RequestCategory } from './model';

/**
 * The request form's unsigned state, and how a past request becomes one.
 *
 * Kept out of the form so the page can build a copy on the server, from
 * the stored request, and the form only has to hold it.
 */

export const DELIVERY_OPTIONS = [1, 2, 3, 5, 7, 14, 30];
/* Days from publishing; 0 keeps the request open until a proposal is chosen. */
export const CLOSING_OPTIONS = [0, 3, 7, 14, 30];

export interface RequestDraft {
  title: string;
  brief: string;
  acceptance: string;
  failSignals: string;
  budget: string;
  chainId: number;
  /**
   * The token the budget is in, by address; null is the chain's $U. Drafts
   * saved before requests had a token have none, and $U is the only thing
   * that form could have meant.
   */
  paymentToken?: string | null;
  deliverDays: number;
  closesInDays: number;
  category: RequestCategory | null;
  savedAt?: string;
}

const DAY_MS = 86_400_000;

/** The first option at least `days`, or the longest one: a copy never offers less time than the original gave. */
function atLeast(options: readonly number[], days: number): number {
  return options.find((o) => o >= days) ?? options[options.length - 1];
}

/**
 * A request that ended, as a draft to post again.
 *
 * Posting again is the same request with a new date, so everything the
 * poster wrote is carried over and nothing has to be retyped. It is a new
 * request all the same: a fresh id, a fresh closing date counted from when
 * it is published, and a fresh signature, since the old one covers the old
 * dates. The proposal window is the one the original had, rounded up to an
 * option the form offers; a request that stayed open until chosen stays so.
 */
export function draftFromRequest(
  request: Pick<Brief, 'title' | 'brief' | 'acceptance' | 'failSignals' | 'budgetU' | 'paymentToken' | 'chainId' | 'deliverDays' | 'closesAt' | 'category' | 'postedAt'>,
): RequestDraft {
  const windowDays = request.closesAt ? (Date.parse(request.closesAt) - Date.parse(request.postedAt)) / DAY_MS : 0;
  return {
    title: request.title,
    brief: request.brief,
    acceptance: request.acceptance.join('\n'),
    failSignals: request.failSignals.join('\n'),
    budget: request.budgetU > 0 ? String(request.budgetU) : '',
    chainId: request.chainId,
    paymentToken: request.paymentToken,
    deliverDays: atLeast(DELIVERY_OPTIONS, request.deliverDays),
    closesInDays: Number.isFinite(windowDays) && windowDays > 0 ? atLeast(CLOSING_OPTIONS.filter((d) => d > 0), Math.round(windowDays)) : 0,
    category: requestCategoryOf(request.category),
  };
}
