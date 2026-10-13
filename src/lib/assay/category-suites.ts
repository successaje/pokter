import type { Category } from '@/lib/agents/categories';

export const CATEGORY_SUITE_IDS = {
  rebalancing: 'rebalancing-arithmetic-1',
  'grid-trading': 'grid-arithmetic-1',
  yield: 'yield-net-return-1',
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

const rebalance = (id: string, current: number[], target: number[]): StaticScenario => {
  const maxDrift = Math.max(...current.map((weight, index) => Math.abs(weight - target[index])));
  const expected = { max_drift_pct: maxDrift, rebalance_needed: maxDrift >= 5 };
  return {
    id,
    expected,
    brief: {
      text: 'Read-only portfolio check. Calculate the largest absolute drift in percentage points and whether the 5 percentage-point rebalance threshold is met. Reply with JSON only: {"max_drift_pct": number, "rebalance_needed": boolean}.',
      data: { suite: CATEGORY_SUITE_IDS.rebalancing, current_weights_pct: current, target_weights_pct: target, threshold_pct: 5, answer_shape: { max_drift_pct: 'number', rebalance_needed: 'boolean' } },
    },
  };
};

const grid = (id: string, lower: number, upper: number, levels: number): StaticScenario => {
  const stepPct = (Math.pow(upper / lower, 1 / (levels - 1)) - 1) * 100;
  const expected = { step_pct: Number(stepPct.toFixed(4)), intervals: levels - 1 };
  return {
    id,
    expected,
    brief: {
      text: 'Read-only grid check. For a geometric grid including both bounds, calculate the percentage step between adjacent prices and the number of intervals. Reply with JSON only: {"step_pct": number, "intervals": number}.',
      data: { suite: CATEGORY_SUITE_IDS['grid-trading'], lower_price: lower, upper_price: upper, levels, answer_shape: { step_pct: 'number', intervals: 'number' } },
    },
  };
};

type YieldRoute = { id: string; apy_pct: number; annual_gas_usd: number; expected_il_pct: number };

const yieldScenario = (id: string, principal: number, routes: YieldRoute[]): StaticScenario => {
  const ranked = routes.map((route) => ({
    id: route.id,
    net: principal * ((route.apy_pct - route.expected_il_pct) / 100) - route.annual_gas_usd,
  })).sort((a, b) => b.net - a.net);
  const expected = { best_route: ranked[0].id, net_annual_usd: Number(ranked[0].net.toFixed(2)) };
  return {
    id,
    expected,
    brief: {
      text: 'Read-only yield comparison. For each route, net annual USD equals principal × (APY − expected IL) − annual gas. Name the best route and its net annual USD. Reply with JSON only: {"best_route": string, "net_annual_usd": number}.',
      data: { suite: CATEGORY_SUITE_IDS.yield, principal_usd: principal, routes, answer_shape: { best_route: 'string', net_annual_usd: 'number' } },
    },
  };
};

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
  rebalancing: {
    id: CATEGORY_SUITE_IDS.rebalancing,
    category: 'rebalancing',
    label: 'Rebalancing arithmetic',
    provenance: 'Fixed portfolio weights with answers calculated by Pokter.',
    limitation: 'Checks arithmetic and threshold handling, not execution quality, slippage or realised returns.',
    scenarios: [
      rebalance('balanced', [50, 30, 20], [50, 30, 20]),
      rebalance('threshold', [55, 25, 20], [50, 30, 20]),
      rebalance('large-drift', [67, 18, 15], [50, 30, 20]),
    ],
  },
  'grid-trading': {
    id: CATEGORY_SUITE_IDS['grid-trading'],
    category: 'grid-trading',
    label: 'Grid arithmetic',
    provenance: 'Fixed ranges with geometric-grid answers calculated by Pokter.',
    limitation: 'Checks grid construction arithmetic, not whether a range will be profitable in a live market.',
    scenarios: [grid('tight-range', 90, 110, 5), grid('wide-range', 60, 140, 9), grid('decimal-range', 0.72, 1.08, 7)],
  },
  yield: {
    id: CATEGORY_SUITE_IDS.yield,
    category: 'yield',
    label: 'Net yield comparison',
    provenance: 'Fixed route assumptions with net returns calculated by Pokter.',
    limitation: 'Checks fee and impermanent-loss arithmetic, not whether quoted APY persists or a protocol is safe.',
    scenarios: [
      yieldScenario('gas-changes-winner', 1_000, [{ id: 'high-apy', apy_pct: 14, annual_gas_usd: 90, expected_il_pct: 1 }, { id: 'efficient', apy_pct: 10, annual_gas_usd: 10, expected_il_pct: 0.5 }]),
      yieldScenario('il-changes-winner', 5_000, [{ id: 'volatile-lp', apy_pct: 18, annual_gas_usd: 20, expected_il_pct: 9 }, { id: 'lending', apy_pct: 10, annual_gas_usd: 12, expected_il_pct: 0 }]),
      yieldScenario('simple-net', 10_000, [{ id: 'route-a', apy_pct: 8.5, annual_gas_usd: 25, expected_il_pct: 0 }, { id: 'route-b', apy_pct: 9.5, annual_gas_usd: 50, expected_il_pct: 1 }]),
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
