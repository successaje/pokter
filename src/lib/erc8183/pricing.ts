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
