import { getAddress, type Address, type Hex } from 'viem';

import { CATEGORIES, NO_CATEGORY, type Category } from '@/lib/agents/categories';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { amountWithinLimits } from '@/lib/hire/budget-limits';
import {
  defaultHireToken,
  displaySymbol,
  enabledHireTokens,
  hireTokenAt,
  offeredTokens,
  paymentTokenAt,
  requestToken,
  settlementChainOf,
  tokenName,
  type HireTokenSet,
  type PaymentToken,
} from '@/lib/network/tokens';

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
  /**
   * Budget the poster expects to fund through escrow, in whole units of
   * `paymentToken` (the name predates other tokens). Kept as the number the
   * poster signed; `budgetRaw` is the same amount at the token's decimals,
   * and is what anything compares.
   */
  budgetU: number;
  /**
   * The token the request is priced in, checksummed, and so the token every
   * proposal on it and the hire it leads to must be in.
   *
   * Null only on a request stored before requests carried a token. The form
   * that wrote those offered $U and nothing else, so null is the chain's $U
   * by construction — read it through `requestToken`, never as "unknown".
   */
  paymentToken: Address | null;
  /** `budgetU` in base units of `paymentToken`, as a decimal string. */
  budgetRaw: string;
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
  /** What the bidder will take for it, in whole units of the request's token. May differ from the budget. */
  priceU: number;
  /**
   * The request's token, checksummed: a proposal is always in the money
   * its request named (`readBidContent` refuses any other). Null only on a
   * proposal stored before proposals carried a token, which was $U.
   */
  paymentToken: Address | null;
  /** `priceU` in base units of that token, as a decimal string. */
  priceRaw: string;
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

/**
 * The amount line of a signed message, in the money it is in.
 *
 * A $U amount is written exactly as it always was — "2.5 $U" — so every
 * request and proposal signed before other tokens existed still verifies
 * against the text its wallet signed. Any other token is named by symbol
 * *and* address and chain, because a symbol alone is a label anyone can
 * deploy: "5 USDT" on its own would be a signature over a word, not over a
 * currency. An address Pokter has not verified cannot be written at all.
 */
function signedAmount(amount: number, chainId: number | null, paymentToken: string | null | undefined): { legacy: true } | { legacy: false; text: string } {
  if (!paymentToken) return { legacy: true };
  const chain = chainId ?? settlementChainOf(paymentToken);
  const token = chain === null ? null : paymentTokenAt(chain, paymentToken);
  if (!token) throw new Error(`No verified token at ${paymentToken}${chain === null ? '' : ` on chain ${chain}`}; refusing to sign an amount in it.`);
  if (token.offered) return { legacy: true };
  return { legacy: false, text: `${amount} ${displaySymbol(token)} (${token.address}) on chain ${token.chainId}` };
}

/** What `briefMessage` reads: the terms, with the token optional so a $U request built by older code signs what it always did. */
export type BriefMessageInput = Omit<BriefContent, 'paymentToken' | 'budgetRaw'> & { paymentToken?: string | null; poster: string; postedAt: string };

/* A brief's own text, in a fixed order. The signature covers the terms a
   builder reads, so neither side can revise them afterwards and claim the
   other agreed to something else. */
export function briefMessage(input: BriefMessageInput): string {
  const amount = signedAmount(input.budgetU, input.chainId, input.paymentToken);
  return [
    'Pokter posted brief',
    `Posted by: ${input.poster.toLowerCase()}`,
    `At: ${input.postedAt}`,
    `Title: ${input.title}`,
    /* Only a non-default token changes the line, for the same reason as closesAt below. */
    amount.legacy ? `Budget: ${input.budgetU} $U on chain ${input.chainId}` : `Budget: ${amount.text}`,
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

/**
 * What `bidMessage` reads. `chainId` is the request's network, which is the
 * one a proposal's price is funded on; the token is optional so a $U
 * proposal built by older code signs what it always did.
 */
export type BidMessageInput = Omit<BidContent, 'paymentToken' | 'priceRaw'> & {
  paymentToken?: string | null;
  chainId?: number;
  briefId: string;
  bidder: string;
  placedAt: string;
};

export function bidMessage(input: BidMessageInput): string {
  const amount = signedAmount(input.priceU, input.chainId ?? null, input.paymentToken);
  return [
    'Pokter bid on a brief',
    `Brief: ${input.briefId}`,
    `Bidder: ${input.bidder.toLowerCase()}`,
    `At: ${input.placedAt}`,
    `Agent: ${input.agentChainId}:${input.agentTokenId}`,
    amount.legacy ? `Price: ${input.priceU} $U` : `Price: ${amount.text}`,
    `Deliver within: ${input.deliverDays} days`,
    `Note: ${input.note}`,
  ].join('\n');
}

/** The poster, awarding. Signed so an award cannot be invented by Pokter. */
export function awardMessage(briefId: string, bidId: string, poster: string, fundsAboveBudget: string | null = null): string {
  /* A proposal above the budget is chosen with the amount in the signature, so agreeing to pay more is on record (`fundsAboveBudget`). */
  return ['Pokter brief award', `Brief: ${briefId}`, `Bid: ${bidId}`, `Poster: ${poster.toLowerCase()}`, ...(fundsAboveBudget ? [`Above my budget, I will fund: ${fundsAboveBudget}`] : [])].join('\n');
}

/**
 * The poster, taking back a choice before it was hired. Signed like the
 * award it undoes, and dated, so a signature cannot be kept and replayed to
 * undo a later choice of the same proposal (`decisionIsFresh`).
 */
export function reopenMessage(briefId: string, bidId: string, poster: string, decidedAt: string): string {
  return ['Pokter request choice changed', `Request: ${briefId}`, `Proposal no longer chosen: ${bidId}`, `Poster: ${poster.toLowerCase()}`, `Decided at: ${decidedAt}`].join('\n');
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
  /** Whole units of `paymentToken`, as signed. */
  priceU: number;
  /** The same price in base units of `paymentToken`: what a quote or a budget is compared with. */
  priceRaw: string;
  /** The request's token, resolved (a legacy request's $U is written out), checksummed. */
  paymentToken: Address;
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
 * The most a proposal for this request may ask: its budget, in its token.
 *
 * A request's budget is what its poster said they would fund, so a price
 * above it is one they have already said no to. A proposal may come in
 * under it. Compared in base units of one token, exactly: a price in
 * another token is not "under" anything, it is a different money, and is
 * refused rather than converted.
 */
export function withinBudget(
  price: { paymentToken: string | null; priceRaw: string },
  request: { chainId: number; paymentToken: string | null; budgetRaw: string },
): boolean {
  const asked = requestToken(request.chainId, request.paymentToken);
  const offered = requestToken(request.chainId, price.paymentToken);
  if (!asked || !offered || asked.address !== offered.address) return false;
  const priceRaw = rawOf(price.priceRaw);
  const budgetRaw = rawOf(request.budgetRaw);
  return priceRaw !== null && budgetRaw !== null && priceRaw <= budgetRaw;
}

const rawOf = (value: string): bigint | null => {
  try {
    return /^\d+$/.test(value) ? BigInt(value) : null;
  } catch {
    return null;
  }
};

/**
 * A whole-unit amount in a token's base units, from the number as it is
 * written — which is the text the wallet signs — so the raw amount is the
 * signed amount exactly, never a float rounded on the way.
 *
 * Null for anything that is not a plain positive decimal, or that has more
 * fractional digits than the token can hold: rounding those away would
 * store an amount nobody signed.
 */
export function amountToRaw(amount: number, decimals: number): bigint | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  const text = String(amount);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const fraction = match[2] ?? '';
  if (fraction.length > decimals) return null;
  return BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}

/** The token a request (or a proposal on it) is priced in; a legacy null reads as the chain's $U. */
export function requestTokenOf(request: { chainId: number; paymentToken?: string | null }): PaymentToken | null {
  return requestToken(request.chainId, request.paymentToken ?? null);
}

/**
 * An amount on a request, in its own money, as the interface states it:
 * "2.5 $U", "5 USDT". A token Pokter cannot name is said to be unknown,
 * never shown as $U.
 */
export function requestAmountLabel(request: { chainId: number; paymentToken?: string | null }, amount: number): string {
  const token = requestTokenOf(request);
  return formatQuotedPrice(amount, token?.address ?? null);
}

/**
 * A signed amount for reading: to the cent when that loses nothing
 * ("2.50"), and every digit when it would ("1.234"), so a figure is never
 * rounded into an amount nobody signed.
 */
export function amountText(amount: number): string {
  return Number(amount.toFixed(2)) === amount ? amount.toFixed(2) : String(amount);
}

/** The unit beside an amount field or a figure: "$U", "Binance-Peg USDT", and "test …" on the testnet so test money is never unmarked. */
export function requestUnit(request: { chainId: number; paymentToken?: string | null }): string {
  const token = requestTokenOf(request);
  const symbol = token ? tokenName(token) : 'unknown token';
  return request.chainId === 97 ? `test ${symbol}` : symbol;
}

/**
 * Why a request may not be priced in this token, or null.
 *
 * Only a token offered for hiring on the request's own chain: a request in
 * any other could be chosen and then never funded. The sentence names the
 * token, so a poster is told which money was refused and not just "invalid".
 */
export function requestTokenProblem(chainId: number, paymentToken: string, enabled: HireTokenSet = enabledHireTokens()): string | null {
  if (hireTokenAt(chainId, paymentToken, enabled)) return null;
  const home = settlementChainOf(paymentToken);
  const known = paymentTokenAt(chainId, paymentToken) ?? (home === null ? null : paymentTokenAt(home, paymentToken));
  const name = known ? `${displaySymbol(known)} (${known.address}${known.chainId !== chainId ? ` on chain ${known.chainId}` : ''})` : paymentToken.slice(0, 64);
  const offered = offeredTokens(chainId, enabled).map(displaySymbol);
  return `${name} is not offered for hiring on chain ${chainId}, so a request cannot be priced in it.${offered.length ? ` Offered there: ${offered.join(', ')}.` : ''}`;
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
export function readBriefContent(raw: unknown, now: number = Date.now(), enabled?: HireTokenSet): BriefContent | null {
  const read = parseBriefContent(raw, now, enabled);
  return read.ok ? read.content : null;
}

const INVALID_BRIEF = 'The brief payload is invalid.';

/**
 * `readBriefContent`, with the sentence a poster can act on when the
 * problem is the money: a token not offered on that chain, or an amount
 * outside what one hire in that token can be funded with. Everything else
 * is a payload the form would never have sent, and gets the plain refusal.
 */
export function parseBriefContent(raw: unknown, now: number = Date.now(), enabled: HireTokenSet = enabledHireTokens()): { ok: true; content: BriefContent } | { ok: false; error: string } {
  const fail = (error = INVALID_BRIEF) => ({ ok: false as const, error });
  if (!raw || typeof raw !== 'object') return fail();
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
  if (!title || title.length > LIMITS.title) return fail();
  if (!brief || brief.length > LIMITS.brief) return fail();
  if (chainId !== 56 && chainId !== 97) return fail();
  /*
   * The money. Absent means $U, and that is not a default chosen here: a
   * client that sends no token signs the legacy text, which says "$U" in
   * so many words, so the currency is in the signature either way. Any
   * token named must be one offered for hiring on this chain.
   */
  let token: PaymentToken | null;
  if (b.paymentToken === undefined || b.paymentToken === null || b.paymentToken === '') {
    token = defaultHireToken(chainId);
  } else {
    if (typeof b.paymentToken !== 'string') return fail();
    const problem = requestTokenProblem(chainId, b.paymentToken, enabled);
    if (problem) return fail(problem);
    token = hireTokenAt(chainId, b.paymentToken, enabled);
  }
  if (!token) return fail();
  /* Within what one hire in this token can be funded with; a request above it could be chosen and never paid. */
  const budgetRaw = amountToRaw(budgetU, token.decimals);
  if (budgetRaw === null) return fail();
  const limits = amountWithinLimits(token, budgetRaw);
  if (!limits.ok) return fail(limits.reason);
  if (!Number.isInteger(deliverDays) || deliverDays < 1 || deliverDays > 30) return fail();
  const acceptance = lines(b.acceptance);
  if (acceptance.length === 0) return fail();
  let closesAt: string | null = null;
  if (b.closesAt !== undefined && b.closesAt !== null && b.closesAt !== '') {
    const at = typeof b.closesAt === 'string' ? Date.parse(b.closesAt) : NaN;
    /* In the future, and not so far out that the request is open in name only. */
    if (!Number.isFinite(at) || at <= now || at > now + MAX_CLOSING_DAYS * 86_400_000) return fail();
    closesAt = new Date(at).toISOString();
  }
  let category: string | null = null;
  if (b.category !== undefined && b.category !== null && b.category !== '') {
    /* Today's ids, or a legacy one from a client still on the earlier form; stored as sent, because it is signed as sent. */
    if (typeof b.category !== 'string' || requestCategoryOf(b.category) === null) return fail();
    category = b.category;
  }
  return {
    ok: true,
    content: { title, brief, acceptance, failSignals: lines(b.failSignals), budgetU, paymentToken: getAddress(token.address), budgetRaw: budgetRaw.toString(), chainId, deliverDays, closesAt, category },
  };
}

/** The request a proposal answers, as far as reading the proposal needs it. */
export type BidRequest = { chainId: number; paymentToken: string | null };

export function readBidContent(raw: unknown, request: BidRequest): BidContent | null {
  const read = parseBidContent(raw, request);
  return read.ok ? read.content : null;
}

const INVALID_BID = 'The bid payload is invalid.';

/**
 * A proposal, read against the request it answers.
 *
 * Its price is in the request's token or it is refused: a proposal in
 * another money is not cheaper or dearer than the budget, it is not
 * comparable to it, and the hire it led to would fund something the
 * poster never priced. Absent means $U, as for a request, so a proposal
 * built by older code on a $U request still reads — and is refused on a
 * request in any other token, with a sentence that names it.
 */
export function parseBidContent(raw: unknown, request: BidRequest): { ok: true; content: BidContent } | { ok: false; error: string } {
  const fail = (error = INVALID_BID) => ({ ok: false as const, error });
  if (!raw || typeof raw !== 'object') return fail();
  const b = raw as Record<string, unknown>;
  const agentChainId = Number(b.agentChainId);
  const agentTokenId = String(b.agentTokenId ?? '');
  const priceU = Number(b.priceU);
  const deliverDays = Number(b.deliverDays);
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, LIMITS.note) : '';
  if (agentChainId !== 56 && agentChainId !== 97) return fail();
  if (!/^\d{1,12}$/.test(agentTokenId)) return fail();
  if (!Number.isInteger(deliverDays) || deliverDays < 1 || deliverDays > 30) return fail();
  const asked = requestTokenOf(request);
  if (!asked) return fail('This request is priced in a token Pokter cannot read, so no proposal can be placed on it.');
  const named = b.paymentToken === undefined || b.paymentToken === null || b.paymentToken === '' ? null : b.paymentToken;
  if (named !== null && typeof named !== 'string') return fail();
  const offered = named === null ? defaultHireToken(request.chainId) : paymentTokenAt(request.chainId, named);
  if (!offered || offered.address !== asked.address) {
    const what = offered ? displaySymbol(offered) : named ?? 'another token';
    return fail(`This request is priced in ${displaySymbol(asked)} (${asked.address}) on chain ${request.chainId}, so a proposal has to be in ${displaySymbol(asked)} too, not ${what}.`);
  }
  const priceRaw = amountToRaw(priceU, asked.decimals);
  if (priceRaw === null) return fail();
  const limits = amountWithinLimits(asked, priceRaw);
  if (!limits.ok) return fail(limits.reason);
  return { ok: true, content: { agentChainId, agentTokenId, priceU, paymentToken: getAddress(asked.address), priceRaw: priceRaw.toString(), deliverDays, note } };
}
