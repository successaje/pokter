/**
 * Bounds on what a session may be allowed to spend.
 *
 * The user signs their own grant, so no server can constrain this — which
 * makes the slider the only control that exists. The testnet range was chosen
 * when a BNB was worth nothing; on mainnet the same numbers authorise real
 * money, so the ceiling and the default both tighten.
 *
 * Conservative on purpose. Someone who needs more can drag further, and that
 * is a deliberate act. Someone who needs less should not have to notice the
 * default was generous.
 */
import { IS_TESTNET } from '@/lib/network/presentation';

export interface SpendCapBounds {
  min: number;
  max: number;
  step: number;
  /** Where the slider starts. */
  preset: number;
}

export const SPEND_CAP_BOUNDS: SpendCapBounds = IS_TESTNET
  ? { min: 0.001, max: 1, step: 0.005, preset: 0.05 }
  : { min: 0.001, max: 0.25, step: 0.005, preset: 0.02 };

/**
 * A spend cap in the currency people actually think in.
 *
 * "0.02 BNB" is not a quantity most users can weigh against their own risk.
 * The price is read from the PancakeSwap pool the product already quotes, so
 * this adds no new dependency; when it is unavailable the figure is simply
 * omitted rather than guessed.
 */
export function formatCapUsd(
  capBnb: number,
  bnbUsdPrice: number | null,
): string | null {
  /*
   * FE-04. Testnet BNB has no value, so a dollar figure beside it is not a
   * conversion — it is a fiction, and it appeared in the same line as the
   * word tBNB, contradicting itself. The price of a token nobody sells is
   * nothing, and the honest rendering of that is no figure at all.
   */
  if (IS_TESTNET) return null;

  if (!bnbUsdPrice || !Number.isFinite(bnbUsdPrice) || bnbUsdPrice <= 0) {
    return null;
  }
  const usd = capBnb * bnbUsdPrice;
  return usd >= 100 ? `$${usd.toFixed(0)}` : `$${usd.toFixed(2)}`;
}
