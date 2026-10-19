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

const LIMITS = { title: 120, brief: 4000, note: 1200, line: 240, lines: 12 } as const;

/** Rejects what cannot be stored or displayed, before any signature work. */
export function readBriefContent(raw: unknown): BriefContent | null {
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
  return { title, brief, acceptance, failSignals: lines(b.failSignals), budgetU, chainId, deliverDays };
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
