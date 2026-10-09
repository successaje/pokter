import { DEFAULT_BUDGET_U, formatBudget } from '@/lib/erc8183/pricing';

/**
 * A number to put in front of a buyer who has none.
 *
 * Five in six agents have never signed a price, and their cards said "Set
 * budget" — which asks somebody who has never bought this service to invent
 * what it is worth, at the exact moment they are deciding whether to buy at
 * all. Of the catalogue's hires, half went to the minority of agents that do
 * name a price, and most of those to a single one. The blank is where the
 * other fifty-two hireable agents are losing.
 *
 * So the list suggests. The suggestion is the median of what agents in the
 * same category actually signed, which is the only defensible figure Pokter
 * holds: it is not a quote, nobody has agreed to it, and the agent may refuse
 * it. The UI has to keep saying that — a suggestion drawn as a price would be
 * Pokter inventing prices on other people's behalf, which is the opposite of
 * what the rest of this product is for.
 */

/** Below this many signed prices a category median is noise, not a median. */
export const SUGGESTION_MIN_SAMPLE = 3;

export interface Suggestion {
  u: number;
  /** What the figure was derived from, so the UI can say so. */
  basis: 'category' | 'catalogue' | 'default';
  /** How many signed prices it rests on. */
  sample: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Round to something a person would type. A median of 0.075 is arithmetically
 * correct and reads like a mistake; buyers reach for 0.05 and 0.1, and the
 * figure is a prompt rather than a calculation.
 */
function toHumanStep(u: number): number {
  const steps = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5];
  /*
   * Ties go to the cheaper step, and deliberately.
   *
   * A median of exactly 0.075 sits the same distance from 0.05 and 0.1, and
   * `Math.abs` decided it on floating-point noise — (0.05 + 0.1) / 2 is
   * 0.07500000000000001, which is fractionally nearer 0.1. That rounded the
   * suggestion up, so the one case where Pokter had no real opinion was the
   * case where it quietly told the buyer to pay more. An epsilon makes the
   * tie explicit and settles it downward: the buyer can always raise it, and
   * the agent can always decline.
   */
  const EPSILON = 1e-9;
  return steps.reduce((best, step) =>
    Math.abs(step - u) < Math.abs(best - u) - EPSILON ? step : best,
  );
}

/**
 * One suggestion per category, from every signed price in the catalogue.
 *
 * Built once per render of the list rather than per row: with the catalogue
 * in hand this is a single pass, and doing it per row would re-sort the same
 * prices for all 162.
 */
export function suggestionsByCategory(
  priced: { category: string; priceU: number }[],
): Map<string, Suggestion> {
  const byCategory = new Map<string, number[]>();
  for (const { category, priceU } of priced) {
    if (!Number.isFinite(priceU) || priceU <= 0) continue;
    const bucket = byCategory.get(category);
    if (bucket) bucket.push(priceU);
    else byCategory.set(category, [priceU]);
  }

  const all = [...byCategory.values()].flat();
  const catalogue: Suggestion = all.length
    ? { u: toHumanStep(median(all)), basis: 'catalogue', sample: all.length }
    : { u: DEFAULT_BUDGET_U, basis: 'default', sample: 0 };

  const out = new Map<string, Suggestion>();
  for (const [category, prices] of byCategory) {
    out.set(
      category,
      prices.length >= SUGGESTION_MIN_SAMPLE
        ? { u: toHumanStep(median(prices)), basis: 'category', sample: prices.length }
        : catalogue,
    );
  }
  return out;
}

/** The fallback for a category nobody in it has ever priced. */
export function catalogueSuggestion(
  suggestions: Map<string, Suggestion>,
): Suggestion {
  for (const s of suggestions.values()) if (s.basis !== 'category') return s;
  const all = [...suggestions.values()];
  return all.length
    ? { u: toHumanStep(median(all.map((s) => s.u))), basis: 'catalogue', sample: all.length }
    : { u: DEFAULT_BUDGET_U, basis: 'default', sample: 0 };
}

/**
 * How a suggestion is written, which is deliberately not how a price is.
 *
 * The tilde is the whole distinction doing its work in one character: a
 * signed price reads `0.10 $U`, a suggestion reads `~0.10 $U`. Anything that
 * renders this must keep it visually quieter than a real price, and must
 * carry `suggestionNote` somewhere a reader can reach.
 */
export function suggestionLabel(s: Suggestion): string {
  return `~${formatBudget(s.u)}`;
}

/** The sentence that stops a suggestion being mistaken for a quote. */
export function suggestionNote(s: Suggestion, categoryLabel?: string): string {
  const prices = `${s.sample} signed ${s.sample === 1 ? 'price' : 'prices'}`;
  const where =
    s.basis === 'category' && categoryLabel
      ? `the ${prices} in ${categoryLabel}`
      : s.basis === 'catalogue'
        ? `the ${prices} across the catalogue`
        : 'nothing — no agent here has signed a price yet';
  return `A starting figure from ${where}. This agent has not quoted it, has not agreed to it, and may decline. Change it to whatever the job is worth to you.`;
}
