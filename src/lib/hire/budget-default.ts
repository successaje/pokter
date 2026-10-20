import { DEFAULT_BUDGET_U } from '@/lib/erc8183/pricing';

/**
 * What the budget field starts at.
 *
 * The hire negotiates a fresh quote at funding time and refuses if the
 * price is above the budget, so this number decides whether a hire
 * completes. It was `signedQuote ?? suggestion ?? 0.1`, and a signed
 * quote lasts fifteen minutes — so for almost every agent on the site the
 * stored quote is expired, counted as absent, and the field opened at
 * 0.1. Portfolio Rebalancer signs 0.5: the buyer was shown "No signed
 * price; you set it", accepted the default, and was then told their
 * budget was too low for a price the page already knew.
 *
 * An expired price is still the best evidence of the next one. It is
 * preferred over the generic suggestion and over the constant, and only
 * a price in a token the escrow cannot settle is ignored — that one is
 * not an estimate of anything payable.
 */
export function budgetDefault(input: {
  /** A current, payable signed quote. */
  signedU?: number | null;
  /** The newest payable signed quote, expired. */
  lastSignedU?: number | null;
  /** Pokter's own suggestion for the category. */
  suggestedU?: number | null;
  /**
   * The price of the proposal the buyer chose on a request. It leads: the
   * buyer has already agreed to it, and the agent's owner signed it.
   */
  proposalU?: number | null;
}): number {
  const usable = (value: number | null | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

  if (usable(input.proposalU)) return input.proposalU;
  if (usable(input.signedU)) return input.signedU;
  if (usable(input.lastSignedU)) return input.lastSignedU;
  if (usable(input.suggestedU)) return input.suggestedU;
  return DEFAULT_BUDGET_U;
}
