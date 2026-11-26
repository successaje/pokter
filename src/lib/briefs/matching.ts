import { NO_CATEGORY } from '@/lib/agents/categories';
import { acceptsProposals, requestCategoryOf, type BriefState } from './model';

export interface MatchableRequest {
  id: string;
  title: string;
  poster: string;
  state: BriefState;
  closesAt?: string | null;
  category?: string | null;
  /** Whole units of `paymentToken`. */
  budgetU: number;
  /** The request's token; null or absent on a request from before tokens, which is $U (`requestToken`). */
  paymentToken?: string | null;
  chainId: number;
  postedAt: string;
  targetBuilder?: string | null;
}

export interface MatchableAgent {
  chainId: number;
  tokenId: string;
  name: string;
  categoryId: string | null;
}

/** Why a wallet's agents are offered a request, so nothing says more than it knows. */
export type MatchReason = 'category' | 'named' | 'no-category';

export interface RequestMatch {
  request: MatchableRequest;
  /** The wallet's agents that could answer it; the first is named in the alert. */
  agents: MatchableAgent[];
  on: MatchReason;
}

/**
 * The open requests a wallet's agents could answer.
 *
 * A request matches when it is still taking proposals, somebody else
 * posted it, and one of three things is true of its category.
 *
 * A declared category is the strongest match: it is the one claim both
 * sides made about themselves, so a `category` match never rests on
 * Pokter guessing what a request "is really about". "Something else"
 * matches nobody, for the same reason — the poster said it fits none of
 * the categories.
 *
 * A request that named *no* category is a third case, and treating it as
 * the second was wrong: saying nothing is not saying none. Nothing on
 * Pokter refuses a proposal for one — the proposal route checks the
 * token, the price, the signature and the owner, never the category — so
 * dropping these left requests nobody could be told about, standing open
 * until they expired. Every request posted from PokterBoard is one, since
 * posting from a wallet collects no category. They match every agent of
 * the wallet, reported as `no-category` so what is shown says to read the
 * brief rather than claiming a fit.
 */
export function matchRequests(requests: MatchableRequest[], agents: MatchableAgent[], wallet: string, now: number = Date.now()): RequestMatch[] {
  const self = wallet.toLowerCase();
  return requests.flatMap((request): RequestMatch[] => {
    if (request.targetBuilder && request.targetBuilder.toLowerCase() !== self) return [];
    if (request.poster.toLowerCase() === self) return [];
    if (!acceptsProposals(request, now)) return [];
    if (request.targetBuilder) return agents.length > 0 ? [{ request, agents, on: 'named' }] : [];
    const category = requestCategoryOf(request.category);
    if (category === NO_CATEGORY) return [];
    if (!category) return agents.length > 0 ? [{ request, agents, on: 'no-category' }] : [];
    const fit = agents.filter((agent) => agent.categoryId === category);
    return fit.length > 0 ? [{ request, agents: fit, on: 'category' }] : [];
  });
}
