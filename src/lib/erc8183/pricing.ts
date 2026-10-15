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
 * A price an agent quoted, as the interface states it.
 *
 * `formatBudget` rounds to two places, which is right for a budget the buyer
 * typed and wrong for a price the agent chose: one listed agent quotes a
 * single wei, and two-place rounding printed that as "0.00 $U" — a free
 * agent, which it is not.
 *
 * Anything above zero that would round away is shown as a bound instead, so
 * the number is never smaller than the truth.
 */
export function formatQuotedPrice(amountU: number, currency?: string | null): string {
  if (amountU === 0) return 'Free';
  const token = tokenLabel(currency);
  if (amountU < 0.01) return `< 0.01 ${token}`;
  return `${amountU.toFixed(2)} ${token}`;
}

/**
 * The token a price is actually denominated in.
 *
 * Every quoted price was printed as "$U" regardless of its token, so an
 * agent quoting 1 USDT was shown as "1.00 $U" on its own page — the right
 * number against the wrong money, on the one figure a buyer uses to
 * decide. The row below it said "Payable by this escrow: No, wrong token",
 * which is the contradiction a reader has to resolve rather than a warning
 * they can act on.
 *
 * An unrecognised token is named by its address rather than guessed at. A
 * short address is less useful than a symbol and more useful than a symbol
 * that is wrong.
 */
export function tokenLabel(currency?: string | null): string {
  if (!currency) return '$U';
  const address = currency.toLowerCase();
  if (ESCROW_TOKENS.has(address)) return '$U';
  const known = KNOWN_TOKENS[address];
  return known ?? `${currency.slice(0, 6)}…${currency.slice(-4)}`;
}

/* The escrow payment tokens, which are the only ones Pokter settles in. */
const ESCROW_TOKENS = new Set([
  '0xce24439f2d9c6a2289f741120fe202248b666666',
  '0xc70b8741b8b07a6d61e54fd4b20f22fa648e5565',
]);

/* Named only so a buyer sees what they were quoted, never to imply Pokter
   can settle it. */
const KNOWN_TOKENS: Record<string, string> = {
  '0x55d398326f99059ff775485246999027b3197955': 'USDT',
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': 'USDC',
  '0xe9e7cea3dedca5984780bafc599bd69add087d56': 'BUSD',
};
