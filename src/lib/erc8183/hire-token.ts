import { getAddress } from 'viem';

import { hireTokenAt, isDefaultHireToken, type PaymentToken } from '@/lib/network/tokens';

/*
 * Which money a hire funds, decided from the seller's signed currency alone.
 * Kept apart from `hire-calls`, which encodes transactions, so a route that
 * only prepares or checks a hire (the prepare route) can ask the question
 * without importing anything that builds a spend.
 */

/** Refused rather than funded in some other money. */
export class UnsupportedHireTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedHireTokenError';
  }
}

/**
 * The token this hire funds in, decided from the signed currency alone.
 *
 * Null for $U — the caller funds exactly as it always has. A token that is
 * not offered on this chain (unknown, or USDT with USDT hiring off) throws:
 * a hire is never quietly funded in the default token instead of the one the
 * seller signed.
 */
export function nonDefaultHireToken(chainId: number, currency: string | null | undefined, usdt?: boolean): PaymentToken | null {
  if (!currency) return null;
  const token = hireTokenAt(chainId, currency, usdt);
  if (!token) {
    const named = (() => {
      try {
        return getAddress(currency);
      } catch {
        return currency;
      }
    })();
    throw new UnsupportedHireTokenError(
      `The seller priced this in ${named}, which Pokter does not fund on chain ${chainId}${usdt === false ? ' while USDT hiring is off' : ''}. Nothing was sent, and it was not switched to another token.`,
    );
  }
  return isDefaultHireToken(token) ? null : token;
}

