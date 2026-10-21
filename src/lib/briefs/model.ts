import type { Address, Hex } from 'viem';

import { CATEGORIES, NO_CATEGORY, type Category } from '@/lib/agents/categories';
import { BUDGET_MAX, BUDGET_MIN } from '@/lib/hire/budget-limits';

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
 * What kind of work a request is: the same vocabulary agents are listed
 * and graded under, so a request lands where the builders who could
 * answer it already look, and a filter on the board means the same thing
 * as one on Discover. A request that fits none of them says so, with the
 * same id an agent uses for "none of the five" (`NO_CATEGORY`).
 */
export const REQUEST_CATEGORIES: ReadonlyArray<{ id: RequestCategory; label: string }> = [
  ...CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  { id: NO_CATEGORY, label: 'Something else' },
];
export type RequestCategory = Category | typeof NO_CATEGORY;

/*
 * Ids an earlier version of the form offered. A category is part of what
 * the poster signs, so a stored request keeps the id it was signed with;
 * these map it to today's category for labels and filters only. Nothing
 * is rewritten.
 */
const LEGACY_REQUEST_CATEGORIES: Readonly<Record<string, RequestCategory>> = {
  'lending-risk': 'health-factor',
  portfolio: 'rebalancing',
  research: NO_CATEGORY,
  monitoring: NO_CATEGORY,
  defi: 'yield',
  data: NO_CATEGORY,
  automation: NO_CATEGORY,
  content: NO_CATEGORY,
};

/** Today's category for a stored id, current or legacy; null for none or unknown. */
export function requestCategoryOf(id: string | null | undefined): RequestCategory | null {
  if (!id) return null;
  if (REQUEST_CATEGORIES.some((c) => c.id === id)) return id as RequestCategory;
  return LEGACY_REQUEST_CATEGORIES[id] ?? null;
}

/** The tag a request row shows; none for "Something else", which is a filter, not a description. */
export function requestCategoryLabel(id: string | null | undefined): string | null {
  const current = requestCategoryOf(id);
  if (current === null || current === NO_CATEGORY) return null;
  return REQUEST_CATEGORIES.find((c) => c.id === current)?.label ?? null;
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
  /**
   * Optional, and kept exactly as signed: usually a `RequestCategory`, but a
   * request signed by an earlier form carries a legacy id. Read it through
   * `requestCategoryOf`.
   */
  category?: string | null;
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

/**
 * Where a request stands, in the words its card and its page both use.
 * One function, so the board can never call a request open that its own
 * page calls closed. `hired` is whether the chosen proposal became a
 * funded job (`hireForProposal`).
 */
export function requestStatus(brief: Pick<Brief, 'state' | 'closesAt'> & { hired?: boolean }, now: number = Date.now()): { label: string; tone: 'open' | 'chosen' | 'ended' } {
  if (brief.state === 'cancelled') return { label: 'Withdrawn', tone: 'ended' };
  if (brief.hired) return { label: 'Agent hired', tone: 'chosen' };
  if (brief.state === 'awarded') return { label: 'Agent chosen', tone: 'chosen' };
  if (!acceptsProposals(brief, now)) return { label: 'Proposals closed', tone: 'ended' };
  return { label: 'Taking proposals', tone: 'open' };
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

/**
 * The most a proposal for this request may ask: its budget.
 *
 * A request's budget is what its poster said they would fund, so a price
 * above it is one they have already said no to. A proposal may come in
 * under it. Floating-point budgets are compared to the cent.
 */
export function withinBudget(priceU: number, budgetU: number): boolean {
  return Number.isFinite(priceU) && Math.round(priceU * 100) <= Math.round(budgetU * 100);
}

/** A proposal is accepted for this long after it was signed. */
export const PROPOSAL_SIGNING_WINDOW_MS = 10 * 60_000;

/**
 * Why a signed proposal is stale, or null.
 *
 * Proposals are public and carry their signatures, and a new one for the
 * same agent replaces the old. Without this, anyone could post an agent's
 * earlier, signed proposal back over its current one. So it must be
 * freshly signed, and newer than the one it replaces.
 */
export function staleProposal(placedAt: string, now: number, current: { placedAt: string } | null): string | null {
  const at = Date.parse(placedAt);
  if (!Number.isFinite(at) || Math.abs(now - at) > PROPOSAL_SIGNING_WINDOW_MS) return 'This proposal was signed too long ago. Sign it again.';
  if (current && Date.parse(current.placedAt) >= at) return 'A newer proposal for this agent is already in place.';
  return null;
}

/** Proposals may be asked for over at most this long. */
export const MAX_CLOSING_DAYS = 60;

export const LIMITS = { title: 120, brief: 4000, note: 1200, line: 240, lines: 12 } as const;

/**
 * Why a list field would not survive the server as written, or null.
 *
 * The server trims a long list rather than refusing it, but the poster has
 * already signed the untrimmed text, so the stored request would no longer
 * match its signature. The form asks for a shorter list instead.
 */
export function listProblem(lines: readonly string[]): string | null {
  if (lines.length > LIMITS.lines) return `At most ${LIMITS.lines} lines.`;
  if (lines.some((l) => l.length > LIMITS.line)) return `Keep each line under ${LIMITS.line} characters.`;
  return null;
}

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
  /* Within what one hire can be funded with; a request above it could be chosen and never paid. */
  if (!Number.isFinite(budgetU) || budgetU < BUDGET_MIN || budgetU > BUDGET_MAX) return null;
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
  let category: string | null = null;
  if (b.category !== undefined && b.category !== null && b.category !== '') {
    /* Today's ids, or a legacy one from a client still on the earlier form; stored as sent, because it is signed as sent. */
    if (typeof b.category !== 'string' || requestCategoryOf(b.category) === null) return null;
    category = b.category;
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
  if (!Number.isFinite(priceU) || priceU < BUDGET_MIN || priceU > BUDGET_MAX) return null;
  if (!Number.isInteger(deliverDays) || deliverDays < 1 || deliverDays > 30) return null;
  return { agentChainId, agentTokenId, priceU, deliverDays, note };
}
