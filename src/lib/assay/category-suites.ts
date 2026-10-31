import type { Category } from '@/lib/agents/categories';
import type { AssayRun } from './types';

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
 *
 * Token safety is at version 2 for the same reason: version 1 supplied
 * contract facts as JSON with no address, and Touchstone refused it.
 */
export const CATEGORY_SUITE_IDS = {
  'grid-trading': 'grid-plan-2',
  yield: 'yield-net-return-2',
  'token-safety': 'token-safety-2',
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
  /** What a pass leaves unchecked, short enough to stand beside the result. */
  unverified: string;
  /** What it checks in two or three words (`AssayDefinition.scope`). */
  scope: string;
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

/**
 * A token-safety brief naming a real BNB Chain address, expecting the
 * verdict class its long-standing facts decide.
 *
 * Version 1 supplied the contract facts as JSON and asked for the rule to
 * be applied to them. A token-safety service reads a token address and
 * finds the facts itself — which is the work being bought — so Touchstone
 * refused all three scenarios and so would any service like it.
 *
 * The addresses are chosen so the deciding fact is readable by anyone and
 * has held for years: an address with no code is not a token, and a
 * Binance-Peg stablecoin keeps an owner wallet that can mint. Only the
 * class of the verdict is expected. Taxes, liquidity and the reasons are
 * live, and grading them against Pokter's own reading would be Pokter
 * marking Touchstone's homework with Touchstone's code.
 */
const tokenSafety = (id: string, token: string, verdict: 'PASS' | 'CAUTION' | 'FAIL'): StaticScenario => ({
  id,
  expected: { verdict },
  brief: {
    text: `Check the BNB Chain token ${token} before a buy: is it safe to trade, and why. Reply with JSON only.`,
    data: { suite: CATEGORY_SUITE_IDS['token-safety'], token },
  },
});

export const STATIC_SUITES: Record<StaticAssayCategory, StaticSuite> = {
  'grid-trading': {
    id: CATEGORY_SUITE_IDS['grid-trading'],
    category: 'grid-trading',
    label: 'Grid plan',
    provenance: 'Briefs naming an asset, a budget, a range and a grid count, with the step and level count those numbers imply calculated by Pokter.',
    limitation: 'Checks that the plan keeps the budget and bounds it was given and spaces the grid correctly. It does not check the live price quoted beside them, and says nothing about whether a range will be profitable.',
    unverified: 'The live price beside the plan, and whether the grid would make money',
    scope: 'grid plan',
    scenarios: [
      grid('bnb-stated-range', 'BNB', 1_000, 900, 1_100, 8),
      grid('cake-wide-range', 'CAKE', 500, 600, 900, 6),
      grid('eth-tight-range', 'ETH', 2_000, 1_800, 2_200, 4),
    ],
  },
  yield: {
    id: CATEGORY_SUITE_IDS.yield,
    category: 'yield',
    label: 'Yield brief terms read back',
    provenance: "Briefs naming an amount, a stablecoin, a horizon and a threshold, checked against the terms the brief itself states.",
    limitation: 'Checks that the answer is about the amount, asset and horizon it was asked for. It does not check the rates quoted, the venue chosen or the net figure, which are live and rest on the agent\'s own cost model.',
    unverified: 'The rates quoted, the venue chosen and the net yield',
    scope: 'yield terms',
    scenarios: [
      yieldScenario('usdt-30-days', 1_000, 'USDT', 30, 0, 0.5),
      yieldScenario('usdc-at-size', 25_000, 'USDC', 90, 2, 1),
      yieldScenario('fdusd-short-horizon', 5_000, 'FDUSD', 14, 3.5, 1.5),
    ],
  },
  'token-safety': {
    id: CATEGORY_SUITE_IDS['token-safety'],
    category: 'token-safety',
    label: 'Token verdict on clear-cut cases',
    provenance: 'BNB Chain addresses whose deciding fact is public and long-standing: one with no contract code, two Binance-Peg stablecoins whose owner wallet keeps a mint function (one is also an upgradable proxy), and WBNB, which has no owner or admin functions.',
    limitation: 'Checks the class of the verdict (safe, caution or avoid) on cases anyone can settle. It does not check the measured taxes, liquidity or reasons, and clear-cut cases say nothing about how a service handles a new token with a hidden sell block.',
    unverified: 'The taxes, liquidity and reasons it reports, and new tokens that hide a sell block',
    scope: 'token verdicts',
    scenarios: [
      // No contract code at this address, so there is no token to buy.
      tokenSafety('not-a-contract', '0x000000000000000000000000000000000000dEaD', 'FAIL'),
      // Binance-Peg BSC-USD: sellable, with an active owner wallet that can mint.
      tokenSafety('owner-can-mint', '0x55d398326f99059fF775485246999027B3197955', 'CAUTION'),
      // Binance-Peg USDC: the same, and an upgradable proxy besides.
      tokenSafety('upgradable-with-mint', '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', 'CAUTION'),
      // WBNB: no owner, no admin functions, not a proxy. A service that calls everything Caution fails here.
      tokenSafety('wrapped-native', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 'PASS'),
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

/*
 * The same output under the names agents actually use.
 *
 * The briefs say "Reply with JSON only" and name no fields, yet the grader
 * read one name per output: the names Pokter's own grid agent happens to
 * use. Nagi answered all three grid scenarios with every figure right —
 * BNB/USDT, a 2.540% step, nine levels, a 1,000 USDT budget — as `base` and
 * `quote`, `price_levels` and `budget`, and was graded 0 / 3 for "not
 * stating" the pair. What is graded is the figure, not its label.
 *
 * Kept short on purpose. Each name is one a builder would use for exactly
 * this output, and every figure is still compared with the expected value,
 * so a name that matched the wrong thing would fail on its value. A brief
 * echoed back is not read: `task` arrives as a string, and `find` reads
 * only nested objects.
 */
/**
 * The revision of the rules `judgeStaticAnswer` grades by. Raise it when a
 * change could alter a recorded result: a paid run graded under a lower
 * revision is graded again (`alreadyGraded`), because a finished run is
 * otherwise never revisited and would keep showing the old verdict.
 *
 * 1: outputs read under their common names (`FIELD_NAMES`, `DERIVED`).
 * 2: an answer that states none of the compared outputs is not graded
 *    (`statesAnyOutput`), rather than failed.
 */
export const GRADING_RULES = 2;

const FIELD_NAMES: Record<string, string[]> = {
  // Not `symbol`: a grid answer's symbol is usually the base alone ("BNB"), and would fail as the pair before base and quote were read.
  pair: ['pair'],
  step_pct: ['step_pct', 'step_percent', 'grid_step_pct'],
  levels: ['levels', 'level_count', 'num_levels', 'levels_count'],
  budget_usd: ['budget_usd', 'budget_usdt', 'budget', 'total_budget'],
  amount: ['amount', 'principal'],
  asset: ['asset', 'stablecoin'],
  holding_days: ['holding_days', 'horizon_days', 'duration_days'],
  current_apr_pct: ['current_apr_pct', 'current_apr'],
  threshold_pp: ['threshold_pp', 'min_improvement_pp'],
};

/** Outputs an answer states in parts: a pair as base and quote, a level count as the list of levels. */
const DERIVED: Record<string, (record: Record<string, unknown>) => unknown> = {
  pair: (record) => {
    const base = find(record, 'base') ?? find(record, 'base_asset');
    const quote = find(record, 'quote') ?? find(record, 'quote_asset');
    return typeof base === 'string' && typeof quote === 'string' ? `${base}/${quote}` : undefined;
  },
  levels: (record) => {
    const list = ['price_levels', 'grid_levels', 'levels'].map((key) => find(record, key)).find(Array.isArray);
    return list ? list.length : undefined;
  },
};

function stated(record: Record<string, unknown>, key: string): unknown {
  for (const name of FIELD_NAMES[key] ?? [key]) {
    const value = find(record, name);
    // A list under the expected name ("levels": [...]) is read through DERIVED, not compared as a value.
    if (value !== undefined && value !== null && !Array.isArray(value)) return value;
  }
  return DERIVED[key]?.(record);
}

/*
 * Services name the same three classes differently: Safe, Caution, Avoid;
 * pass, warn, fail; low, medium, high risk. What is graded is the class,
 * so each word is read into one before comparing. An unrecognised word is
 * left as it is and fails, rather than being guessed into a class.
 */
const VERDICT_CLASSES: Record<string, 'PASS' | 'CAUTION' | 'FAIL'> = {
  PASS: 'PASS', SAFE: 'PASS', OK: 'PASS', LOW: 'PASS', 'LOW RISK': 'PASS',
  CAUTION: 'CAUTION', WARN: 'CAUTION', WARNING: 'CAUTION', MEDIUM: 'CAUTION', 'MEDIUM RISK': 'CAUTION', RISKY: 'CAUTION',
  FAIL: 'FAIL', AVOID: 'FAIL', DANGER: 'FAIL', DANGEROUS: 'FAIL', UNSAFE: 'FAIL', HIGH: 'FAIL', 'HIGH RISK': 'FAIL', SCAM: 'FAIL', HONEYPOT: 'FAIL',
};

export function verdictClass(value: unknown): string {
  const word = String(value).trim().toUpperCase().replace(/[_-]+/g, ' ');
  return VERDICT_CLASSES[word] ?? word;
}

/** Whether an answer states any output a scenario compares. One that states none gives the check nothing to grade. */
export function statesAnyOutput(expected: Record<string, unknown>, observed: Record<string, unknown> | null): boolean {
  return observed !== null && Object.keys(expected).some((key) => observed[key] !== undefined && observed[key] !== null);
}

/* What a reader is told about an answer that states none of the compared outputs. */
const unstatedReason = (expected: Record<string, unknown>) =>
  `The answer states none of what this check compares (${Object.keys(expected).map((key) => key.replaceAll('_', ' ')).join(', ')}), so it was not graded. That is not counted for or against the agent.`;

/**
 * An answer, graded against the outputs its scenario fixes.
 *
 * `stated` is false when the answer states none of them. That is not a
 * wrong answer: the yield briefs fix only the buyer's own terms, so an
 * agent that answered the question it was asked (a venue, a net rate)
 * without repeating those terms was failed on every scenario for leaving
 * out what it was never asked to repeat. Such an answer is set aside, and
 * the reply itself is kept for a reader to judge. An answer that states
 * some of the outputs is still graded on all of them.
 */
export function judgeStaticAnswer(expected: Record<string, unknown>, answer: { text: string | null; data: Record<string, unknown> | null }): { pass: boolean; stated: boolean; observed: Record<string, unknown> | null; reason: string } {
  const record = answerRecord(answer);
  if (!record) return { pass: false, stated: false, observed: null, reason: 'No JSON object could be read from the answer.' };
  const observed: Record<string, unknown> = Object.fromEntries(Object.keys(expected).map((key) => [key, stated(record, key)]));
  if (!statesAnyOutput(expected, observed)) return { pass: false, stated: false, observed, reason: unstatedReason(expected) };
  for (const [key, wanted] of Object.entries(expected)) {
    const got = observed[key];
    // Not stated is not the same as stated wrongly, and "answered undefined" told a builder nothing.
    if (got === undefined || got === null) return { pass: false, stated: true, observed, reason: `The answer does not state ${key.replaceAll('_', ' ')}; the scenario expects ${String(wanted)}.` };
    if (typeof wanted === 'number') {
      const numeric = typeof got === 'number' ? got : typeof got === 'string' ? Number(got) : Number.NaN;
      const tolerance = Math.max(0.01, Math.abs(wanted) * 0.005);
      if (!Number.isFinite(numeric) || Math.abs(numeric - wanted) > tolerance) return { pass: false, stated: true, observed, reason: `${key} should be ${wanted}; answered ${String(got)}.` };
    } else if (typeof wanted === 'string') {
      const answered = key === 'verdict' ? verdictClass(got) : String(got).trim().toUpperCase();
      if (answered !== wanted.toUpperCase()) return { pass: false, stated: true, observed, reason: `${key} should be ${wanted}; answered ${String(got)}.` };
    } else if (got !== wanted) {
      return { pass: false, stated: true, observed, reason: `${key} should be ${String(wanted)}; answered ${String(got)}.` };
    }
  }
  return { pass: true, stated: true, observed, reason: 'All required outputs matched the published scenario.' };
}

type Verdict = ReturnType<typeof judgeStaticAnswer>;

/**
 * Whether a second ask (the brief's structured part alone) is asked, and
 * whether its answer replaces the first.
 *
 * It is asked only when the first gave the check nothing to grade. An
 * unreadable first answer takes any readable second one; a readable first
 * that stated nothing gives way only to a second that states something, so
 * a worse reply never replaces a better one.
 */
export function needsSecondAsk(first: Verdict): boolean {
  return !first.stated;
}

export function secondAskWins(first: Verdict, second: Verdict | null): boolean {
  if (!second || first.stated) return false;
  return first.observed === null ? second.observed !== null : second.stated;
}

const STATIC_SUITE_IDS: ReadonlySet<string> = new Set(Object.values(CATEGORY_SUITE_IDS));

/**
 * The scenarios a run counts: everything but the rows set aside as not
 * stated, still in their delivery window, or not comparable. `total` on a
 * run is this count, so `passed === total` means every graded answer matched.
 */
export const NOT_COUNTED: ReadonlySet<string> = new Set(['not-stated', 'pending', 'not-comparable']);

/** Why some answers were not graded, said once for the run. */
export function unstatedNote(count: number, of: number): string {
  return count === of
    ? 'Answered, but no answer stated any of what this check compares, so none could be graded.'
    : `${count} of ${of} answers stated none of what this check compares and were not graded.`;
}

/**
 * A static run read with today's rule for answers that state nothing it
 * compares (`GRADING_RULES` 2).
 *
 * Runs recorded before the rule failed those answers, and a free run is
 * not repeated for days, so the page kept saying "0 of 3" in the meantime.
 * Read here, the same rows are set aside without rewriting the record,
 * the way `freeRunStatus` is applied to older free runs.
 */
export function setAsideUnstated(run: AssayRun): AssayRun {
  if (run.status !== 'checked' || !STATIC_SUITE_IDS.has(run.suite)) return run;
  let moved = 0;
  const results = run.results.map((result) => {
    if (result.pass || result.outcome !== 'wrong') return result;
    const expected = object(result.expected);
    const observed = object(result.observed);
    if (!expected || !observed || statesAnyOutput(expected, observed)) return result;
    moved += 1;
    return { ...result, outcome: 'not-stated', reason: unstatedReason(expected) };
  });
  if (moved === 0) return run;
  const total = Math.max(0, run.total - moved);
  const note = unstatedNote(moved, run.total);
  return { ...run, results, total, detail: [run.detail, note].filter(Boolean).join(' ') };
}
