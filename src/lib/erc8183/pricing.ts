import { formatQuoted, paymentTokenAt, settlementChainOf } from '@/lib/network/tokens';

/**
 * The default escrow budget, in $U.
 *
 * It was a literal in five places — the wallet readiness check, the
 * commission form's initial state, the detail page's hire card and two
 * strings reading "0.10 $U". A price that appears on a card, is checked
 * against a balance and is then funded has to be one number, or the card can
 * advertise something the escrow does not ask for.
 */
export const DEFAULT_BUDGET_U = 0.1;

/** The same number as the interface says it, e.g. "0.10 $U". */
export const DEFAULT_BUDGET_LABEL = `${DEFAULT_BUDGET_U.toFixed(2)} $U`;

/**
 * A budget as the interface states it.
 *
 * The form holds a raw number, so 0.1 rendered as "0.1 $U" beside a card
 * advertising "0.10 $U" — the same amount written two ways on two screens of
 * the same flow. Anything user-facing goes through here.
 */
export function formatBudget(amountU: number): string {
  return `${amountU.toFixed(2)} $U`;
}

/**
 * A price an agent quoted, as the interface states it, in the quote's own
 * money.
 *
 * The currency is required. It defaulted to "$U", so every caller that left
 * it out — the discovery card among them — printed a USDT price as $U while
 * the agent's own page, which passed it, said USDT. `null` means the
 * currency is not known, and says so.
 *
 * Not rounded to two places: a price is shown as the number the agent
 * signed (to twelve significant figures, which every stable price here
 * fits), so a funded amount is never displayed as something else. Where
 * the raw signed amount is at hand, `formatQuotedRaw` is exact to the unit.
 */
export function formatQuotedPrice(amount: number, currency: string | null): string {
  if (amount === 0) return 'Free';
  return `${plainNumber(amount)} ${tokenLabel(currency)}`;
}

/** A signed amount from its raw units, exact to the unit, in its own token; the address when the token is not one Pokter knows. */
export function formatQuotedRaw(currency: string | null, raw: string | bigint): string {
  if (!currency) return `${raw.toString()} base units (currency unknown)`;
  return formatQuoted(currency, raw)?.label ?? `${raw.toString()} base units of ${currency}`;
}

function plainNumber(amount: number): string {
  const n = Number(amount.toPrecision(12));
  return n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 18 });
}

/**
 * The token a price is denominated in, from the registry by address.
 *
 * An unrecognised token is named by its address rather than guessed at, and
 * an absent one is said to be unknown — never assumed to be $U.
 */
export function tokenLabel(currency: string | null | undefined): string {
  if (!currency) return '(currency unknown)';
  const chainId = settlementChainOf(currency);
  const token = chainId === null ? null : paymentTokenAt(chainId, currency);
  if (token) return token.symbol === 'U' ? '$U' : token.symbol;
  const known = KNOWN_TOKENS[currency.toLowerCase()];
  return known ?? `${currency.slice(0, 6)}…${currency.slice(-4)}`;
}

/* Tokens Pokter does not record (and so cannot fund), named so a buyer sees what they were quoted. */
const KNOWN_TOKENS: Record<string, string> = {
  '0xe9e7cea3dedca5984780bafc599bd69add087d56': 'BUSD',
};
