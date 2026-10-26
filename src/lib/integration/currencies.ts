import { displaySymbol, offeredTokens, type HireTokenSet } from '@/lib/network/tokens';

/**
 * The money Pokter funds on an escrow, as the kit and the builder prompt
 * state it.
 *
 * Both said "the payment token … (18 decimals)", one token per escrow and a
 * fixed scale. With USDT hiring an escrow funds more than one token, and the
 * scale belongs to the token: a price is an integer in *that* token's
 * smallest unit, at the decimals read from its contract and recorded in the
 * registry. Listing them from `offeredTokens` keeps the document and the
 * funding path one list, so the kit cannot name a token Pokter will refuse
 * or omit one it would fund.
 */
export interface KitToken {
  address: string;
  /** As the product writes it: "$U", "USDT". */
  symbol: string;
  decimals: number;
  /** The escrow default, funded by `createJob`. */
  default: boolean;
}

export function kitTokens(chainId: number, enabled?: HireTokenSet): KitToken[] {
  return offeredTokens(chainId, enabled).map((t) => ({ address: t.address, symbol: displaySymbol(t), decimals: t.decimals, default: t.offered }));
}

/** "$U (0xcE24…, 18 decimals)" or "$U (…) or USDT (…)", for prose. */
export function tokenListText(chainId: number, enabled?: HireTokenSet): string {
  const tokens = kitTokens(chainId, enabled);
  if (tokens.length === 0) return 'no token (this escrow is not enabled)';
  return tokens.map((t) => `${t.symbol} (${t.address}, ${t.decimals} decimals)`).join(' or ');
}

/** The settlement hint's currency preference, in one sentence the kit and the prompt share. */
export const PREFERRED_CURRENCY_RULE =
  'A buyer may send a preferred currency with the brief, outside the signed terms, as preferred_currency: { chain_id, token } (with symbol and decimals). If you accept payment in that token, sign your price in it; if you do not, sign in a currency you do accept from the escrow’s list. It is a request, never a requirement, and the job is funded in exactly the currency you sign.';

/** The price rule, without a fixed scale. */
export const PRICE_UNITS_RULE =
  'An integer string in the smallest unit of the token named in currency, at that token’s own decimals (listed per escrow under tokens). Never assume 18: read the decimals for the token you price in.';

/**
 * The money a hire on this chain is paid in, in words for marketing copy:
 * "$U" while only $U is offered, "$U or USDT" once USDT hiring is on, and
 * "$U, USDT or USDC" beyond that. Pages said "real $U" as if it were the
 * only money, which stops being true the moment another token is offered.
 */
export function moneyWords(chainId: number, enabled?: HireTokenSet): string {
  const symbols = kitTokens(chainId, enabled).map((t) => t.symbol);
  if (symbols.length === 0) return 'test tokens';
  if (symbols.length === 1) return symbols[0];
  return `${symbols.slice(0, -1).join(', ')} or ${symbols[symbols.length - 1]}`;
}
