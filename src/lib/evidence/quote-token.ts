import { quoteTokenFor } from '@/lib/network/currency-preference';
import type { ChainId } from '@/lib/scan/types';

/**
 * The token the Evidence agent prices in for this request: the buyer's
 * preferred currency when Pokter funds it on this chain, otherwise undefined
 * (the escrow default). The same rule as the house agents (`quoteTokenFor`),
 * so Pokter's own agents answer a preference the same way.
 */
export function evidenceQuoteToken(chainId: ChainId, data: unknown, defaultToken: string): string | undefined {
  const token = quoteTokenFor(chainId, data, defaultToken);
  return token.offered ? undefined : token.address;
}
