import type { Address, Hex } from 'viem';

/**
 * A brief is demand, posted before any agent is chosen.
 *
 * Pokter's catalogue answers "who could do this". It has never had an
 * answer to "nobody listed does this, who will build it" — the question a
 * marketplace needs if supply is to follow demand rather than only be
 * browsed.
 *
 * Everything here is signed, for the same reason everything else on this
 * site is. A brief carries its poster's signature so a builder can see who
 * is asking and that the terms have not been edited since; a bid carries
 * the agent's, so a price offered here is the same kind of object as a
 * price quoted through `negotiate` — a commitment by a wallet, not a row in
 * Pokter's database.
 */

/**
 * What kind of work a request is, for the board's filters.
 *
 * Its own short list rather than the agent categories: those are five
 * kinds of DeFi agent Pokter grades, and most requests are not one of
 * them. A request asks for work; this says roughly what sort.
 */
export const REQUEST_CATEGORIES = [
  { id: 'research', label: 'Research' },
  { id: 'defi', label: 'DeFi' },
  { id: 'data', label: 'Data' },
  { id: 'automation', label: 'Automation' },
  { id: 'content', label: 'Content' },
] as const;
export type RequestCategory = (typeof REQUEST_CATEGORIES)[number]['id'];

export function requestCategoryLabel(id: string | null | undefined): string | null {
  return REQUEST_CATEGORIES.find((c) => c.id === id)?.label ?? null;
}

export const BRIEF_STATES = ['open', 'awarded', 'cancelled'] as const;
export type BriefState = (typeof BRIEF_STATES)[number];

export interface BriefContent {
  title: string;
  /** What is being asked for, in the poster's own words. */
  brief: string;
  /** What a delivery has to do to be accepted. One per line. */
  acceptance: string[];
  /**
   * What would make a delivery wrong, as distinct from merely absent.
   *
   * Worth its own field rather than folding into acceptance: a criterion
   * says what to produce and is read as a checklist, where this says what
   * not to do and is read before anybody starts. A brief that lists both
   * can be argued about with evidence instead of taste.
   */
  failSignals: string[];
  /** Budget the poster expects to fund through escrow, in $U. */
  budgetU: number;
  /** Which escrow the award would be funded on. */
  chainId: number;
  /** Days from award to delivery. */
  deliverDays: number;
  /**
   * When proposals stop being accepted, as an ISO time; null for a request
   * that stays open until it is awarded or withdrawn.
   *
   * Kept apart from `deliverDays` on purpose: one is how long builders have
   * to answer, the other how long the chosen agent has to deliver, and a
   * form that asked for "a deadline" would get whichever the poster meant.
   */
  closesAt?: string | null;
  /** Optional; a request without one is listed under every filter's "All". */
  category?: RequestCategory | null;
}

export interface Brief extends BriefContent {
  id: string;
  poster: Address;
  signature: Hex;
  state: BriefState;
  postedAt: string;
  /** Set when a bid is accepted. */
  awardedBidId: string | null;
}

export interface BidContent {
  /** The agent being offered, by its ERC-8004 identity. */
  agentChainId: number;
  agentTokenId: string;
  /** What the bidder will take for it, in $U. May differ from the budget. */
  priceU: number;
  deliverDays: number;
  /** How it will be done, and anything in the brief the bidder disputes. */
  note: string;
}

export interface Bid extends BidContent {
  id: string;
  briefId: string;
  /**
   * The wallet that signed. Either the agent's registered wallet or the
   * owner the registry names for it — see `bidderIsEntitled`.
   */
  bidder: Address;
  signature: Hex;
  placedAt: string;
}

/* A brief's own text, in a fixed order. The signature covers the terms a
   builder reads, so neither side can revise them afterwards and claim the
   other agreed to something else. */
export function briefMessage(input: BriefContent & { poster: string; postedAt: string }): string {
  return [
    'Pokter posted brief',
    `Posted by: ${input.poster.toLowerCase()}`,
    `At: ${input.postedAt}`,
    `Title: ${input.title}`,
    `Budget: ${input.budgetU} $U on chain ${input.chainId}`,
    `Deliver within: ${input.deliverDays} days`,
    `Brief: ${input.brief}`,
    `Acceptance: ${input.acceptance.join(' | ')}`,
    `Fail signals: ${input.failSignals.join(' | ')}`,
    /* Only when set, so a request posted before closing dates existed still
       verifies against the message its poster actually signed. */
    ...(input.closesAt ? [`Proposals close: ${input.closesAt}`] : []),
    ...(input.category ? [`Category: ${input.category}`] : []),
  ].join('\n');
}

export function bidMessage(input: BidContent & { briefId: string; bidder: string; placedAt: string }): string {
  return [
    'Pokter bid on a brief',
    `Brief: ${input.briefId}`,
    `Bidder: ${input.bidder.toLowerCase()}`,
    `At: ${input.placedAt}`,
    `Agent: ${input.agentChainId}:${input.agentTokenId}`,
    `Price: ${input.priceU} $U`,
    `Deliver within: ${input.deliverDays} days`,
    `Note: ${input.note}`,
  ].join('\n');
}

/** The poster, awarding. Signed so an award cannot be invented by Pokter. */
export function awardMessage(briefId: string, bidId: string, poster: string): string {
  return ['Pokter brief award', `Brief: ${briefId}`, `Bid: ${bidId}`, `Poster: ${poster.toLowerCase()}`].join('\n');
}

/**
 * The poster, withdrawing. Signed for the same reason an award is: Pokter
 * should not be able to take a request down on somebody's behalf.
 */
export function withdrawMessage(briefId: string, poster: string): string {
  return ['Pokter request withdrawn', `Request: ${briefId}`, `Poster: ${poster.toLowerCase()}`].join('\n');
}

/** Whether a request still takes proposals: open, and before its closing time if it has one. */
export function acceptsProposals(brief: Pick<Brief, 'state' | 'closesAt'>, now: number = Date.now()): boolean {
  if (brief.state !== 'open') return false;
  return !brief.closesAt || Date.parse(brief.closesAt) > now;
}

/** A chosen proposal, carried into the hire so its price can be held against the agent's quote. */
export interface ProposalForHire {
  requestId: string;
  requestTitle: string;
  priceU: number;
  deliverDays: number;
  /** The network the request asked to be funded on. */
  chainId: number;
}

/** The hire brief's length limit; the hire form will not hold more. */
const HIRE_TASK_MAX = 2000;

/**
 * The task an agent is hired with, from the request it was chosen for.
 *
 * The request's text alone loses what made it a request: the lines a
 * delivery is accepted or rejected by. Those go to the agent too. If the
 * whole would overflow the hire form, the description is shortened and the
 * criteria kept, because they are what the delivery will be held to.
 */
export function hireTaskFromRequest(brief: Pick<BriefContent, 'brief' | 'acceptance' | 'failSignals'>): string {
  const criteria = [
    brief.acceptance.length > 0 ? `Done when:\n${brief.acceptance.map((l) => `- ${l}`).join('\n')}` : '',
    brief.failSignals.length > 0 ? `Rejected if:\n${brief.failSignals.map((l) => `- ${l}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const tail = criteria ? `\n\n${criteria}` : '';
  const room = HIRE_TASK_MAX - tail.length;
  const text = brief.brief.length > room ? `${brief.brief.slice(0, Math.max(0, room - 1)).trimEnd()}…` : brief.brief;
  return `${text}${tail}`.slice(0, HIRE_TASK_MAX);
}

/** Proposals may be asked for over at most this long. */
export const MAX_CLOSING_DAYS = 60;

const LIMITS = { title: 120, brief: 4000, note: 1200, line: 240, lines: 12 } as const;

/** Rejects what cannot be stored or displayed, before any signature work. */
export function readBriefContent(raw: unknown, now: number = Date.now()): BriefContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  const brief = typeof b.brief === 'string' ? b.brief.trim() : '';
  const budgetU = Number(b.budgetU);
  const chainId = Number(b.chainId);
  const deliverDays = Number(b.deliverDays);
  const lines = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.map((v) => String(v).trim()).filter(Boolean).slice(0, LIMITS.lines).map((v) => v.slice(0, LIMITS.line))
      : [];
  if (!title || title.length > LIMITS.title) return null;
  if (!brief || brief.length > LIMITS.brief) return null;
  if (!Number.isFinite(budgetU) || budgetU <= 0) return null;
  if (chainId !== 56 && chainId !== 97) return null;
  if (!Number.isInteger(deliverDays) || deliverDays < 1 || deliverDays > 30) return null;
  const acceptance = lines(b.acceptance);
  if (acceptance.length === 0) return null;
  let closesAt: string | null = null;
  if (b.closesAt !== undefined && b.closesAt !== null && b.closesAt !== '') {
    const at = typeof b.closesAt === 'string' ? Date.parse(b.closesAt) : NaN;
    /* In the future, and not so far out that the request is open in name only. */
    if (!Number.isFinite(at) || at <= now || at > now + MAX_CLOSING_DAYS * 86_400_000) return null;
    closesAt = new Date(at).toISOString();
  }
  let category: RequestCategory | null = null;
  if (b.category !== undefined && b.category !== null && b.category !== '') {
    if (!REQUEST_CATEGORIES.some((c) => c.id === b.category)) return null;
    category = b.category as RequestCategory;
  }
  return { title, brief, acceptance, failSignals: lines(b.failSignals), budgetU, chainId, deliverDays, closesAt, category };
}

export function readBidContent(raw: unknown): BidContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const agentChainId = Number(b.agentChainId);
  const agentTokenId = String(b.agentTokenId ?? '');
  const priceU = Number(b.priceU);
  const deliverDays = Number(b.deliverDays);
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, LIMITS.note) : '';
  if (agentChainId !== 56 && agentChainId !== 97) return null;
  if (!/^\d{1,12}$/.test(agentTokenId)) return null;
  if (!Number.isFinite(priceU) || priceU <= 0) return null;
  if (!Number.isInteger(deliverDays) || deliverDays < 1 || deliverDays > 30) return null;
  return { agentChainId, agentTokenId, priceU, deliverDays, note };
}
