import { createHash, randomBytes } from 'node:crypto';

import type { BriefRefusalCode } from '@/lib/erc8183/skill-request';
import type { FailureLayer, QuoteFailureCode } from '@/lib/hire/failure';

/**
 * Why a buyer's ask stopped before the agent was ever called.
 *
 * `QuoteFailureCode` starts at the point Pokter talks to the seller, and
 * these three happen earlier: the brief was too short for an agent that
 * publishes no example to stand in for it, a structured brief did not match
 * the examples the card declares, or the brief could not be turned into a
 * request for any skill the card names. Pokter classified every one of them
 * and then dropped it on the floor, which is the exact gap this feature
 * exists to close — and the resulting report told builders that every buyer
 * who asked got a signed price while buyers were being bounced at 400.
 *
 * Added here rather than in `hire/failure.ts`: that union is published in
 * the integration kit as the refusals a *seller* can produce, and these are
 * refusals Pokter issues before any seller is involved. The existing
 * `BriefRefusalCode` is reused whole rather than restated.
 */
export type InputRefusalCode = BriefRefusalCode | 'brief-too-short' | 'invalid-task';

/** Every code an attempt can carry: the seller's refusals and Pokter's own. */
export type AttemptCode = QuoteFailureCode | InputRefusalCode;

/**
 * One buyer asking this agent for a price, recorded once however many
 * times it was retried.
 *
 * The sweep already records why Pokter's own scheduled price request
 * failed (`quote_failures`), and a builder reading that row has no way to
 * tell it from a buyer who tried and left: Pokter probes every listed
 * agent on a schedule, so that table is Pokter's demand, not the market's.
 * This is the other half — attempts that arrived through the hire flow —
 * and it is kept apart from the probe tables on purpose so that neither
 * can ever be presented as the other.
 */
export type AttemptSource =
  /** Through `/api/hire/quote`: a buyer on the hire page, about to fund. */
  | 'buyer'
  /** Through `/api/trial`: a free signed-price request, builder or assistant. */
  | 'trial';

export const ATTEMPT_SOURCES: readonly AttemptSource[] = ['buyer', 'trial'];

export type AttemptOutcome = 'quoted' | 'stopped';

/** How long a builder's diagnostics look back. UTC days, not rolling hours. */
export const ATTEMPT_WINDOW_DAYS = 30;

/** Rows older than this are dropped: they answer nothing a builder asks. */
export const ATTEMPT_RETENTION_DAYS = 90;

export interface HireAttemptInput {
  chainId: number;
  tokenId: string;
  escrowChainId: number | null;
  source: AttemptSource;
  outcome: AttemptOutcome;
  /** Why it stopped; null when it was quoted. */
  code: AttemptCode | null;
  layer: FailureLayer | null;
  /**
   * The seller's own words, already through `sanitiseFailureReason`.
   *
   * Never the brief, never the buyer. A seller's refusal is the one piece
   * of free text here, it arrives from a third party's endpoint, and it is
   * why the sanitiser is a requirement on the way in rather than a
   * courtesy on the way out.
   */
  sellerReason: string | null;
  at: string;
  fingerprint: string;
}

export interface HireAttemptRow {
  fingerprint: string;
  chainId: number;
  tokenId: string;
  escrowChainId: number | null;
  source: AttemptSource;
  outcome: AttemptOutcome;
  code: AttemptCode | null;
  layer: FailureLayer | null;
  sellerReason: string | null;
  /** How many requests collapsed into this one attempt. */
  tries: number;
  firstAt: string;
  lastAt: string;
}

/** The UTC day an attempt belongs to. */
export function attemptDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * One spelling of a registry number, so a row written by one route can be
 * read by another.
 *
 * `45422` and `045422` are the same ERC-8004 identity and were two
 * different strings: `/api/hire/quote` accepts `/^\d+$/`, so a buyer
 * arriving at `?tokenId=045422` recorded attempts under that literal key,
 * and the diagnostics panel — which asks for `45422`, because that is what
 * the registry and every link use — never showed them. The builder saw a
 * quiet month that was not quiet.
 *
 * A token id is a uint256, so the ceiling is its 78 decimal digits rather
 * than the 12 the other builder routes happen to cap at. That cap was the
 * second half of the same split: a 13-digit id could be recorded by the
 * quote route and was refused by the reader, so those rows were
 * unreachable too.
 *
 * Returns null for anything that is not a plain decimal number, which is
 * the caller's cue to refuse rather than to guess.
 */
export function canonicalTokenId(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!/^\d{1,78}$/.test(text)) return null;
  const stripped = text.replace(/^0+(?=\d)/, '');
  return stripped === '' ? '0' : stripped;
}

/** A fresh salt for a new database. Never leaves the volume. */
export function newAttemptSalt(): string {
  return randomBytes(32).toString('base64');
}

/**
 * The identity of one attempt, derived from things that are never stored.
 *
 * Two problems take the same answer. A buyer who presses the button three
 * times because the agent timed out twice made **one** attempt, and
 * counting three would tell their builder they had three times the demand
 * they have. And the fields that make an attempt identifiable — the
 * caller's network address and the brief they typed — are exactly the
 * fields diagnostics must never hold. So the row is keyed by a salted
 * hash of them and keeps neither.
 *
 * The salt is random per database, so the key is not one dictionary lookup
 * away from the brief it came from, and it is not comparable with any
 * other install's rows.
 *
 * The day is part of the key deliberately: a buyer returning tomorrow with
 * the same brief is new demand, not the same attempt still running. An
 * edited brief is a new attempt too, which is right — it is a different
 * thing to have been asked for.
 */
export function attemptFingerprint(input: {
  salt: string;
  clientKey: string;
  chainId: number;
  tokenId: string;
  brief: string;
  day: string;
}): string {
  return createHash('sha256')
    .update(
      [
        input.salt,
        input.day,
        input.clientKey,
        `${input.chainId}:${input.tokenId}`,
        // Whitespace-insensitive: a retry that re-wraps the textarea is the same ask.
        input.brief.replace(/\s+/g, ' ').trim(),
      ].join('\u0000'),
    )
    .digest('hex')
    .slice(0, 32);
}

/** Attempts a buyer made, as opposed to trials and Pokter's own checks. */
export function buyerAttempts(rows: readonly HireAttemptRow[]): HireAttemptRow[] {
  return rows.filter((row) => row.source === 'buyer');
}
