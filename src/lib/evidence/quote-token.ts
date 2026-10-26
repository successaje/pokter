import { hireTokenAt } from '@/lib/network/tokens';
import type { ChainId } from '@/lib/scan/types';

/**
 * The token the Evidence agent prices in for this request, or undefined for
 * the escrow default.
 *
 * Only `EVIDENCE_QUOTE_TOKEN` asks for another, and only when that token is
 * offered on the chain (USDT hiring on) and the buyer's settlement hint,
 * when it lists currencies, lists it. Unset in production: it exists for a
 * USDT rehearsal on testnet, where no other agent signs in USDT. A buyer
 * whose hint leaves the token out is quoted the default, never a price it
 * cannot fund.
 */
export function evidenceQuoteToken(chainId: ChainId, accepts: unknown, configured: string | undefined = process.env.EVIDENCE_QUOTE_TOKEN): string | undefined {
  if (!configured) return undefined;
  const token = hireTokenAt(chainId, configured);
  if (!token) return undefined;
  if (Array.isArray(accepts)) {
    const listed = accepts.some((c) => {
      const entry = c as { chain_id?: unknown; token?: unknown } | null;
      return entry?.chain_id === chainId && typeof entry.token === 'string' && entry.token.toLowerCase() === token.address.toLowerCase();
    });
    if (!listed) return undefined;
  }
  return token.address;
}
