import type { Category } from '@/lib/agents/categories';

/*
 * Version 2 for grid and yield: the fixture changed, so the id changes.
 *
 * Version 1 asked for arithmetic over values supplied as JSON — current
 * weights, route tables, bare prices — with an `answer_shape` telling the
 * agent what to return. No agent in those categories accepts that. Every
 * one reads its inputs from a brief written the way a buyer writes one,
 * so Pokter's own three refused their own category's fixture on every
 * scenario: Centreline wants a wallet, Gridloom an asset and a budget,
 * Cresthold an amount and a stablecoin. A suite nothing can answer
 * measures nothing.
 *
 * Version 2 asks in the buyer's idiom and expects only what the brief
 * itself determines — the geometric step a stated range and level count
 * imply, the amount and horizon echoed back. Live figures in the same
 * answer are not expected values here; they are what the paid health
 * factor check grades against a reading of its own.
 */
export const CATEGORY_SUITE_IDS = {
  'grid-trading': 'grid-plan-2',
  yield: 'yield-net-return-2',
  'token-safety': 'token-safety-facts-1',
} as const satisfies Partial<Record<Category, string>>;

export type StaticAssayCategory = keyof typeof CATEGORY_SUITE_IDS;

export interface StaticScenario {
  id: string;
  brief: { text: string; data: Record<string, unknown> };
  expected: Record<string, unknown>;
}

export interface StaticSuite {
  id: string;
  category: StaticAssayCategory;
  label: string;
  provenance: string;
  limitation: string;
  scenarios: StaticScenario[];
}

/**
 * A grid brief in the words a buyer uses, with the arithmetic its own
 * numbers fix.
 *
 * A stated range and grid count determine the geometric step and the
 * number of levels whatever the market does, so they can be expected
 * exactly. The budget is expected back because losing it is a real
 * failure mode: a competitor's grid agent read a 1,000 USDT budget as
 * 814 — the upper price bound — and allocated that instead.
 *
 * `price_now` is deliberately not expected. It is live, and an answer is
 * not wrong for having been produced at a different minute.
 */
const grid = (id: string, base: string, budgetUsd: number, lower: number, upper: number, grids: number): StaticScenario => {
  const step = Math.exp(Math.log(upper / lower) / grids) - 1;
  return {
    id,
    expected: {
      pair: `${base}/USDT`,
      step_pct: Math.round(step * 100 * 1000) / 1000,
      levels: grids + 1,
      budget_usd: budgetUsd,
    },
    brief: {
      text: `Grid plan for ${base} with ${budgetUsd} USDT, range ${lower} to ${upper}, ${grids} grids. Geometric spacing. Reply with JSON only.`,
      data: { suite: CATEGORY_SUITE_IDS['grid-trading'], base, budget_usdt: budgetUsd, range: { lower, upper }, grids, spacing: 'geometric' },
    },
  };
};

/**
 * A stablecoin-yield brief as a buyer writes it, expecting back only what
 * the brief fixes.
 *
 * The amount, the asset, the horizon and the threshold are the buyer's own
 * terms, and an answer that quietly changes them has answered a different
 * question — the failure this is for. A review of Pokter found exactly
 * that shape worth asking about: a 1,000 USDT brief answered with a USDC
 * recommendation, where whether the conversion cost was carried could not
 * be told from the outside.
 *
 * Rates, the recommended venue and the net figure are not expected. They
 * are live, they depend on the agent's own cost model, and pinning them
 * here would be Pokter marking its own homework.
 */
const yieldScenario = (id: string, amount: number, asset: string, days: number, currentAprPct: number, thresholdPp: number): StaticScenario => ({
  id,
  expected: {
    amount,
    asset,
    holding_days: days,
    current_apr_pct: currentAprPct,
    threshold_pp: thresholdPp,
  },
  brief: {
    text: `I hold ${amount} ${asset} earning ${currentAprPct}% and can leave it for ${days} days. Only move it for at least ${thresholdPp} points more. Where is the best net stablecoin yield? Reply with JSON only.`,
    data: { suite: CATEGORY_SUITE_IDS.yield, amount, asset, holding_days: days, current_apr_pct: currentAprPct, threshold_pp: thresholdPp },
  },
});

type TokenFacts = { sellable: boolean; owner_can_mint: boolean; owner_can_blacklist: boolean; upgradeable: boolean };

const tokenSafety = (id: string, facts: TokenFacts): StaticScenario => {
  const verdict = !facts.sellable ? 'FAIL' : facts.owner_can_mint || facts.owner_can_blacklist || facts.upgradeable ? 'CAUTION' : 'PASS';
  const expected = { verdict };
  return {
    id,
    expected,
    brief: {
      text: 'Read-only token safety check using the supplied verified contract facts. FAIL when the token is not sellable; otherwise CAUTION when the owner can mint, blacklist, or upgrade; otherwise PASS. Reply with JSON only: {"verdict": "PASS" | "CAUTION" | "FAIL"}.',
      data: { suite: CATEGORY_SUITE_IDS['token-safety'], verified_contract_facts: facts, answer_shape: { verdict: 'PASS | CAUTION | FAIL' } },
    },
  };
};

export const STATIC_SUITES: Record<StaticAssayCategory, StaticSuite> = {
  'grid-trading': {
    id: CATEGORY_SUITE_IDS['grid-trading'],
    category: 'grid-trading',
    label: 'Grid plan',
    provenance: 'Briefs naming an asset, a budget, a range and a grid count, with the step and level count those numbers imply calculated by Pokter.',
    limitation: 'Checks that the plan keeps the budget and bounds it was given and spaces the grid correctly. It does not check the live price quoted beside them, and says nothing about whether a range will be profitable.',
    scenarios: [
      grid('bnb-stated-range', 'BNB', 1_000, 900, 1_100, 8),
      grid('cake-wide-range', 'CAKE', 500, 600, 900, 6),
      grid('eth-tight-range', 'ETH', 2_000, 1_800, 2_200, 4),
    ],
  },
  yield: {
    id: CATEGORY_SUITE_IDS.yield,
    category: 'yield',
    label: 'Net yield at your size',
    provenance: "Briefs naming an amount, a stablecoin, a horizon and a threshold, checked against the terms the brief itself states.",
    limitation: 'Checks that the answer is about the amount, asset and horizon it was asked for. It does not check the rates quoted, the venue chosen or the net figure, which are live and rest on the agent\'s own cost model.',
    scenarios: [
      yieldScenario('usdt-30-days', 1_000, 'USDT', 30, 0, 0.5),
      yieldScenario('usdc-at-size', 25_000, 'USDC', 90, 2, 1),
      yieldScenario('fdusd-short-horizon', 5_000, 'FDUSD', 14, 3.5, 1.5),
    ],
  },
  'token-safety': {
    id: CATEGORY_SUITE_IDS['token-safety'],
    category: 'token-safety',
    label: 'Token risk classification',
    provenance: 'Fixed, explicitly supplied contract facts with a published decision rule.',
    limitation: 'Checks classification from supplied facts, not independent bytecode analysis or live sell simulation.',
    scenarios: [
      tokenSafety('blocked-sale', { sellable: false, owner_can_mint: false, owner_can_blacklist: false, upgradeable: false }),
      tokenSafety('admin-controls', { sellable: true, owner_can_mint: true, owner_can_blacklist: false, upgradeable: false }),
      tokenSafety('no-listed-controls', { sellable: true, owner_can_mint: false, owner_can_blacklist: false, upgradeable: false }),
    ],
  },
};

export function staticSuiteFor(category: Category | 'unclassified'): StaticSuite | null {
  return category in STATIC_SUITES ? STATIC_SUITES[category as StaticAssayCategory] : null;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function answerRecord(answer: { text: string | null; data: Record<string, unknown> | null }): Record<string, unknown> | null {
  const json = answer.text?.match(/\{[\s\S]*\}/)?.[0];
  let parsed: Record<string, unknown> | null = null;
  if (json) {
    try { parsed = object(JSON.parse(json)); } catch { /* Use structured data when prose contains malformed JSON. */ }
  }
  if (answer.data && parsed) return { ...parsed, ...answer.data };
  return answer.data ?? parsed;
}

function find(record: Record<string, unknown>, key: string, depth = 0): unknown {
  if (key in record) return record[key];
  if (depth >= 2) return undefined;
  for (const value of Object.values(record)) {
    const nested = object(value);
    if (nested) {
      const found = find(nested, key, depth + 1);
      if (found !== undefined) return found;
    }
  }
}

export function judgeStaticAnswer(expected: Record<string, unknown>, answer: { text: string | null; data: Record<string, unknown> | null }): { pass: boolean; observed: Record<string, unknown> | null; reason: string } {
  const record = answerRecord(answer);
  if (!record) return { pass: false, observed: null, reason: 'No JSON object could be read from the answer.' };
  const observed: Record<string, unknown> = {};
  for (const [key, wanted] of Object.entries(expected)) {
    const got = find(record, key);
    observed[key] = got;
    if (typeof wanted === 'number') {
      const numeric = typeof got === 'number' ? got : typeof got === 'string' ? Number(got) : Number.NaN;
      const tolerance = Math.max(0.01, Math.abs(wanted) * 0.005);
      if (!Number.isFinite(numeric) || Math.abs(numeric - wanted) > tolerance) return { pass: false, observed, reason: `${key} should be ${wanted}; answered ${String(got)}.` };
    } else if (typeof wanted === 'string') {
      if (String(got).trim().toUpperCase() !== wanted.toUpperCase()) return { pass: false, observed, reason: `${key} should be ${wanted}; answered ${String(got)}.` };
    } else if (got !== wanted) {
      return { pass: false, observed, reason: `${key} should be ${String(wanted)}; answered ${String(got)}.` };
    }
  }
  return { pass: true, observed, reason: 'All required outputs matched the published scenario.' };
}
