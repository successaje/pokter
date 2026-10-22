import { createHash, randomBytes } from 'node:crypto';

import type { FailureLayer, QuoteFailureCode } from '@/lib/hire/failure';

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
  /** The `QuoteFailureCode` when the attempt stopped; null when it was quoted. */
  code: QuoteFailureCode | null;
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
  code: QuoteFailureCode | null;
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
