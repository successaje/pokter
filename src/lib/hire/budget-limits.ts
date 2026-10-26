import type { PaymentToken } from '@/lib/network/tokens';

/**
 * What one hire may be funded with, in whole units of its token.
 *
 * Its own module so the request board can hold budgets and proposals to
 * the same limit as the hire they lead to without importing the hire
 * hook: a request priced above what a hire accepts is one that can be
 * chosen and then never funded.
 *
 * The same whole-unit range for every token Pokter offers. They are all
 * dollar stablecoins, so 0.01–5 means the same money in each — but the
 * range is never converted between them, and it is applied in each token's
 * own base units (`budgetLimitsFor`), never with an assumed scale.
 */
export const BUDGET_MIN = 0.01;
export const BUDGET_MAX = 5;

const pow10 = (n: number) => 10n ** BigInt(n);

/** The range in a token's own base units. */
export function budgetLimitsFor(token: Pick<PaymentToken, 'decimals' | 'symbol'> & { name?: string }): { minRaw: bigint; maxRaw: bigint; min: number; max: number; symbol: string } {
  const unit = pow10(token.decimals);
  return {
    minRaw: (unit * 1n) / 100n,
    maxRaw: unit * BigInt(BUDGET_MAX),
    min: BUDGET_MIN,
    max: BUDGET_MAX,
    symbol: token.name ?? (token.symbol === 'U' ? '$U' : token.symbol),
  };
}

/** Whether an exact amount is inside the range, and if not, the sentence that says so. */
export function amountWithinLimits(token: Pick<PaymentToken, 'decimals' | 'symbol'> & { name?: string }, raw: bigint): { ok: true } | { ok: false; side: 'below' | 'above'; reason: string } {
  const l = budgetLimitsFor(token);
  if (raw < l.minRaw) return { ok: false, side: 'below', reason: `Pokter funds a job of at least ${l.min} ${l.symbol}.` };
  if (raw > l.maxRaw) return { ok: false, side: 'above', reason: `Pokter funds a job of at most ${l.max} ${l.symbol}, and this one is more.` };
  return { ok: true };
}
