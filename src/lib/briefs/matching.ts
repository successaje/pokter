import { NO_CATEGORY } from '@/lib/agents/categories';
import { acceptsProposals, requestCategoryOf, type BriefState } from './model';

export interface MatchableRequest {
  id: string;
  title: string;
  poster: string;
  state: BriefState;
  closesAt?: string | null;
  category?: string | null;
  budgetU: number;
  chainId: number;
  postedAt: string;
}

export interface MatchableAgent {
  chainId: number;
  tokenId: string;
  name: string;
  categoryId: string | null;
}

export interface RequestMatch {
  request: MatchableRequest;
  /** The wallet's agents listed in the request's category; the first is named in the alert. */
  agents: MatchableAgent[];
}

/**
 * The open requests a wallet's agents could answer.
 *
 * A request matches when it is still taking proposals, its category is one
 * an agent of this wallet is listed under, and somebody else posted it.
 * Category is the whole test on purpose: it is the one claim both sides
 * made about themselves, so an alert never rests on Pokter guessing what a
 * request "is really about". A request in "Something else" matches nobody,
 * for the same reason — it said it fits none of the categories.
 */
export function matchRequests(requests: MatchableRequest[], agents: MatchableAgent[], wallet: string, now: number = Date.now()): RequestMatch[] {
  const self = wallet.toLowerCase();
  return requests.flatMap((request) => {
    const category = requestCategoryOf(request.category);
    if (!category || category === NO_CATEGORY) return [];
    if (request.poster.toLowerCase() === self) return [];
    if (!acceptsProposals(request, now)) return [];
    const fit = agents.filter((agent) => agent.categoryId === category);
    return fit.length > 0 ? [{ request, agents: fit }] : [];
  });
}
