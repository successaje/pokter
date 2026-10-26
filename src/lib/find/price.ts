import { formatQuotedPrice, formatQuotedRaw } from '@/lib/erc8183/pricing';
import { isDollarUPrice } from '@/lib/find/suggested';
import { displaySymbol, formatQuoted, paymentTokenAt, settlementChainOf } from '@/lib/network/tokens';

/**
 * A signed price as a label, in the quote's own token.
 *
 * One function because the card, the agent page, its share image and the
 * MCP card each wrote it, and each wrote "$U". From the raw signed units
 * where they were recorded, so the label is exactly the amount a hire
 * would fund; from the number otherwise. "Free" stays "Free". A missing or
 * unverified currency is named as such, never filled in.
 */
export function quotePriceLabel(quote: { priceU: number; priceRaw?: string | null; currency?: string | null }): string {
  const currency = quote.currency ?? null;
  if (Number(quote.priceU) === 0) return formatQuotedPrice(0, currency);
  return quote.priceRaw ? formatQuotedRaw(currency, quote.priceRaw) : formatQuotedPrice(Number(quote.priceU), currency);
}

/**
 * A signed price on the wire, in the token it is signed in.
 *
 * `amountU` was the only figure, and it was the quote's number whatever
 * the token: an agent signing 0.5 USDT was published as `amountU: 0.5`, a
 * $U price, to every caller that read the field by its name. It stays for
 * the callers that read it, and only where it is true — the quote is in
 * $U — and is null otherwise, so a caller treating it as $U is never handed
 * another token's number.
 *
 * The rest says the money exactly: `amount` is the signed amount in whole
 * units as a decimal string (never a float), from the token's own recorded
 * decimals; `priceRaw` is the signed integer. `symbol`, `decimals` and
 * `settlementChainId` are null for a token Pokter has not verified, and
 * `amount` with them: a scale is never assumed.
 *
 * Here rather than in `lib/api/v1`, which is server-only, so the shape can
 * be pinned in a test.
 */
export interface WirePrice {
  /** @deprecated $U callers only; null unless the quote is in $U. Read `amount` and `symbol`. */
  amountU: number | null;
  amount: string | null;
  symbol: string | null;
  decimals: number | null;
  priceRaw: string;
  currency: string;
  settlementChainId: number | null;
}

export function wirePrice(quote: { priceU: number; priceRaw: string; currency: string }): WirePrice {
  const chainId = settlementChainOf(quote.currency);
  const token = chainId === null ? null : paymentTokenAt(chainId, quote.currency);
  const exact = token ? formatQuoted(quote.currency, quote.priceRaw) : null;
  return {
    amountU: isDollarUPrice(quote.currency) ? Number(quote.priceU) : null,
    amount: exact?.amount ?? null,
    symbol: token ? displaySymbol(token) : null,
    decimals: token?.decimals ?? null,
    priceRaw: quote.priceRaw,
    currency: quote.currency,
    settlementChainId: chainId,
  };
}
