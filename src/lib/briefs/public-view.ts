import { displaySymbol, tokenIdentity } from '@/lib/network/tokens';

import { acceptsProposals, LIMITS, requestAmountLabel, requestCategoryLabel, requestCategoryOf, requestStatus, requestTokenOf, type Bid, type Brief } from './model';

/**
 * A request as the public API and the MCP tools return it.
 *
 * The request page already shows all of this to anyone: the terms, the
 * poster's address, the proposals and their notes. This is that page as
 * data, in one shape for both callers, so an assistant asked to "find work
 * for my agent" reads the same request a person would — with the amounts
 * in the request's own token, named by contract, and its status in the
 * words the board uses. Signatures are left out: they are for verifying a
 * proposal, which the proposal route does, not for reading one.
 */

/** The delivery times the proposal form offers, so a prepared proposal can always be shown in it. */
export const DELIVERY_OPTIONS = [1, 2, 3, 5, 7, 14, 30] as const;

/** A request's money: the exact signed number, its token by contract, and the label the page shows. */
function money(brief: Brief, amount: number) {
  const token = requestTokenOf(brief);
  return {
    amount: String(amount),
    symbol: token ? displaySymbol(token) : null,
    token: token?.address ?? null,
    tokenIdentity: token ? tokenIdentity(token) : null,
    label: requestAmountLabel(brief, amount),
    testTokens: brief.chainId === 97,
  };
}

export interface RequestFilter {
  /** Words to look for in the title, the brief and the acceptance criteria. */
  query?: string;
  category?: string | null;
  chainId?: number | null;
  /** Only requests still taking proposals. On unless turned off. */
  openOnly?: boolean;
}

const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}$]+/u).filter((w) => w.length > 1);

/**
 * The requests that match, best first: by how many of the query's words
 * each contains, then newest. With no query, newest first. A request
 * matches a category only by the category its poster signed, never by
 * Pokter's reading of its text — the same rule the builders' alerts use.
 */
export function filterRequests(briefs: readonly Brief[], filter: RequestFilter = {}, now = Date.now()): Brief[] {
  const asked = [...new Set(words(filter.query ?? ''))];
  const scored = briefs.flatMap((brief) => {
    if (filter.openOnly !== false && !acceptsProposals(brief, now)) return [];
    if (filter.chainId && brief.chainId !== filter.chainId) return [];
    if (filter.category && requestCategoryOf(brief.category) !== filter.category) return [];
    if (asked.length === 0) return [{ brief, score: 0 }];
    const have = new Set(words([brief.title, brief.brief, ...brief.acceptance].join(' ')));
    const score = asked.filter((w) => have.has(w)).length;
    return score > 0 ? [{ brief, score }] : [];
  });
  return scored.sort((a, b) => b.score - a.score || Date.parse(b.brief.postedAt) - Date.parse(a.brief.postedAt)).map((s) => s.brief);
}

export interface RequestFacts {
  /** How many proposals it has. */
  proposals: number;
  /** Whether the chosen proposal became a funded job (`hireForChosenProposal`). */
  hired: boolean;
}

/** One request in a list. */
export function requestSummary(brief: Brief, facts: RequestFacts, origin: string, now = Date.now()) {
  const status = requestStatus({ ...brief, hired: facts.hired }, now);
  const category = requestCategoryOf(brief.category);
  return {
    id: brief.id,
    title: brief.title,
    status: status.label,
    takingProposals: acceptsProposals(brief, now),
    chainId: brief.chainId,
    network: brief.chainId === 56 ? 'BNB Chain' : 'BNB Testnet',
    category: category ? { id: category, label: requestCategoryLabel(category) } : null,
    budget: money(brief, brief.budgetU),
    deliverDays: brief.deliverDays,
    closesAt: brief.closesAt ?? null,
    postedAt: brief.postedAt,
    poster: brief.poster,
    proposals: facts.proposals,
    page: `${origin}/requests/${brief.id}`,
  };
}

/** One request in full: its terms, and every proposal on it without the signatures. */
export function requestDetail(brief: Brief, bids: readonly Bid[], facts: Omit<RequestFacts, 'proposals'>, origin: string, now = Date.now()) {
  return {
    ...requestSummary(brief, { ...facts, proposals: bids.length }, origin, now),
    brief: brief.brief,
    acceptance: brief.acceptance,
    failSignals: brief.failSignals,
    proposalsList: bids.map((bid) => ({
      agent: { chainId: bid.agentChainId, tokenId: bid.agentTokenId, page: `${origin}/agents/${bid.agentChainId}/${bid.agentTokenId}` },
      price: money(brief, bid.priceU),
      deliverDays: bid.deliverDays,
      note: bid.note,
      placedAt: bid.placedAt,
      bidder: bid.bidder,
      chosen: brief.awardedBidId === bid.id,
    })),
    toPropose: acceptsProposals(brief, now)
      ? `Signed by the wallet the ERC-8004 registry names as the agent's owner, in ${money(brief, brief.budgetU).symbol ?? 'the request’s token'} at or under the budget, on the request's page. MCP: prepare_proposal checks a proposal and returns a link for the owner to review and sign.`
      : 'This request is not taking proposals.',
  };
}

/** A proposal to pre-fill on the request page, for the owner to review and sign. */
export interface ProposalPrefill {
  agentChainId: 56 | 97;
  agentTokenId: string;
  /**
   * A price the owner chose above the agent's signed one, in $U only
   * (`proposal-price.ts`). Absent, the form starts at the agent's signed
   * price; either way it is checked against that price again.
   */
  price?: string;
  deliverDays: (typeof DELIVERY_OPTIONS)[number];
  note: string;
}

/**
 * The longest prepared link Pokter hands out. Browsers take far longer
 * ones, but chat apps, mail clients and proxies cut or refuse links past
 * a couple of thousand characters, and a note is up to 1,200 characters
 * that can triple in length once encoded.
 */
export const PROPOSAL_LINK_MAX = 2000;

/**
 * The request page's link that opens the proposal form with these values
 * in it — without the note when carrying it would make the link longer
 * than `PROPOSAL_LINK_MAX`, so the owner pastes it instead of opening a
 * link that arrives cut short.
 */
export function proposalLink(origin: string, requestId: string, prefill: ProposalPrefill): { url: string; noteInLink: boolean } {
  const url = new URL(`/requests/${requestId}`, origin);
  url.searchParams.set('propose', `${prefill.agentChainId}:${prefill.agentTokenId}`);
  if (prefill.price) url.searchParams.set('price', prefill.price);
  url.searchParams.set('days', String(prefill.deliverDays));
  const bare = url.href;
  if (!prefill.note) return { url: bare, noteInLink: true };
  url.searchParams.set('note', prefill.note);
  return url.href.length <= PROPOSAL_LINK_MAX ? { url: url.href, noteInLink: true } : { url: bare, noteInLink: false };
}

/*
 * Control characters, and the ones that reorder text on screen (bidi
 * overrides and isolates), from a note read out of a link. A note is
 * shown as text, never as markup, but a right-to-left override can still
 * make what the owner reads differ from what they would sign.
 */
const UNSAFE_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;

/** A note as plain text: line breaks and tabs kept, control and reordering characters dropped. */
export function plainNote(text: string): string {
  return text.replace(UNSAFE_TEXT, '');
}

/**
 * The pre-fill a request page was opened with, or null.
 *
 * Read from a link anyone can write, so only well-formed values survive,
 * and the form shows each one for the owner to check before signing:
 * nothing here is sent anywhere until they do, and nothing in it is
 * trusted when they do — the proposal route checks the request, its
 * token and budget, and the agent's owner afresh on every proposal.
 */
export function readProposalPrefill(params: Record<string, string | string[] | undefined>): (Omit<ProposalPrefill, 'deliverDays'> & { deliverDays: ProposalPrefill['deliverDays'] | null }) | null {
  const one = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : '');
  const agent = /^(56|97):(\d{1,12})$/.exec(one('propose'));
  if (!agent) return null;
  const price = /^\d{1,12}(\.\d{1,18})?$/.test(one('price')) ? one('price') : '';
  const days = Number(one('days'));
  return {
    agentChainId: Number(agent[1]) as 56 | 97,
    agentTokenId: agent[2],
    price,
    /* Not one the form offers: left to the form's own default rather than guessed. */
    deliverDays: (DELIVERY_OPTIONS as readonly number[]).includes(days) ? (days as ProposalPrefill['deliverDays']) : null,
    note: plainNote(one('note')).slice(0, LIMITS.note),
  };
}
