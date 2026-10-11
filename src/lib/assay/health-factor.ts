/**
 * Health factor check, suite hf-1.
 *
 * A health factor is arithmetic with one right answer: the liquidation
 * value of the collateral divided by the debt,
 *
 *   HF = Σ (collateral value × liquidation threshold) / Σ debt value
 *
 * and a position can be liquidated once it falls below 1. So an agent that
 * monitors health factors can be checked the way a calculator is checked:
 * give it positions whose answer is known and compare.
 *
 * What this checks is the calculation from supplied figures. It does not
 * check that an agent reads a live position correctly from a protocol,
 * which needs chain state and is a separate suite. The scenarios are fixed
 * and published, so anyone can rerun them; changing one means a new suite id.
 */
export const HF_SUITE_ID = 'hf-1';

/** Relative tolerance on the health factor: rounding, not judgement. */
export const HF_TOLERANCE = 0.01;

export interface HfPosition {
  collateral: Array<{ asset: string; valueUsd: number; liquidationThreshold: number }>;
  debt: Array<{ asset: string; valueUsd: number }>;
}

export interface HfExpected {
  /** Null when there is no debt: the health factor is unbounded. */
  healthFactor: number | null;
  liquidatable: boolean;
}

export interface HfScenario {
  id: string;
  title: string;
  position: HfPosition;
}

export function computeHealthFactor(position: HfPosition): HfExpected {
  const debt = position.debt.reduce((sum, d) => sum + d.valueUsd, 0);
  if (debt <= 0) return { healthFactor: null, liquidatable: false };
  const capacity = position.collateral.reduce((sum, c) => sum + c.valueUsd * c.liquidationThreshold, 0);
  const healthFactor = capacity / debt;
  return { healthFactor, liquidatable: healthFactor < 1 };
}

export const HF_SCENARIOS: HfScenario[] = [
  {
    id: 'single-healthy',
    title: 'One collateral asset, comfortably healthy',
    position: { collateral: [{ asset: 'BNB', valueUsd: 1000, liquidationThreshold: 0.8 }], debt: [{ asset: 'USDT', valueUsd: 500 }] },
  },
  {
    id: 'multi-asset',
    title: 'Two collateral assets with different thresholds, two debts',
    position: {
      collateral: [
        { asset: 'BNB', valueUsd: 2000, liquidationThreshold: 0.75 },
        { asset: 'USDT', valueUsd: 1000, liquidationThreshold: 0.8 },
      ],
      debt: [
        { asset: 'USDC', valueUsd: 1500 },
        { asset: 'BTCB', valueUsd: 500 },
      ],
    },
  },
  {
    id: 'liquidatable',
    title: 'Below 1: can be liquidated now',
    position: { collateral: [{ asset: 'BNB', valueUsd: 1000, liquidationThreshold: 0.8 }], debt: [{ asset: 'USDT', valueUsd: 820 }] },
  },
  {
    id: 'no-debt',
    title: 'Collateral and no debt: nothing to liquidate',
    position: { collateral: [{ asset: 'BNB', valueUsd: 1000, liquidationThreshold: 0.8 }], debt: [] },
  },
  {
    id: 'non-collateral-asset',
    title: 'One supplied asset does not count as collateral',
    position: {
      collateral: [
        { asset: 'CAKE', valueUsd: 1000, liquidationThreshold: 0 },
        { asset: 'USDT', valueUsd: 500, liquidationThreshold: 0.8 },
      ],
      debt: [{ asset: 'USDC', valueUsd: 300 }],
    },
  },
];

/** The brief an agent receives: the figures, the formula's inputs, and the answer shape. */
export function hfBrief(scenario: HfScenario): { text: string; data: Record<string, unknown> } {
  const text =
    'Read-only check. Compute the health factor of the lending position below from the figures given; ' +
    'do not look anything up and execute no transaction. Liquidation threshold is the share of each collateral ' +
    "asset's value that counts towards borrowing. Reply with JSON only: " +
    '{"health_factor": number or null when there is no debt, "liquidatable": boolean}.\n\n' +
    JSON.stringify(scenario.position);
  return { text, data: { suite: HF_SUITE_ID, scenario: scenario.id, position: scenario.position, answer_shape: { health_factor: 'number | null', liquidatable: 'boolean' } } };
}

export interface HfObserved {
  healthFactor: number | null;
  /** True when the agent said there is no health factor (no debt): null, Infinity or a huge value. */
  unbounded: boolean;
  liquidatable: boolean | null;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const HF_KEYS = ['health_factor', 'healthFactor', 'healthfactor', 'hf'];
const LIQ_KEYS = ['liquidatable', 'is_liquidatable', 'isLiquidatable', 'can_be_liquidated'];

function findKey(record: Record<string, unknown>, keys: string[], depth = 0): unknown {
  for (const key of keys) if (key in record) return record[key];
  if (depth >= 2) return undefined;
  for (const value of Object.values(record)) {
    const nested = object(value);
    if (nested) {
      const found = findKey(nested, keys, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function readHf(value: unknown): { healthFactor: number | null; unbounded: boolean } | null {
  if (value === null) return { healthFactor: null, unbounded: true };
  if (typeof value === 'number') return Number.isFinite(value) ? (value > 1e6 ? { healthFactor: null, unbounded: true } : { healthFactor: value, unbounded: false }) : { healthFactor: null, unbounded: true };
  if (typeof value === 'string') {
    if (/^\s*(inf(inity)?|∞|null|none|n\/a|unbounded)\s*$/i.test(value)) return { healthFactor: null, unbounded: true };
    const n = Number(value.trim());
    if (Number.isFinite(n)) return readHf(n);
  }
  return null;
}

function readBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (/^\s*(true|yes)\s*$/i.test(value)) return true;
    if (/^\s*(false|no)\s*$/i.test(value)) return false;
  }
  return null;
}

/** Pull the agent's health factor and liquidatable flag out of its answer, structured or prose. */
export function readHfAnswer(answer: { text: string | null; data: Record<string, unknown> | null }): HfObserved | null {
  const records: Record<string, unknown>[] = [];
  if (answer.data) records.push(answer.data);
  if (answer.text) {
    const match = answer.text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = object(JSON.parse(match[0]));
        if (parsed) records.push(parsed);
      } catch {
        /* Not JSON; fall through to prose. */
      }
    }
  }
  for (const record of records) {
    const hfValue = findKey(record, HF_KEYS);
    if (hfValue === undefined) continue;
    const hf = readHf(hfValue);
    if (!hf) continue;
    return { ...hf, liquidatable: readBool(findKey(record, LIQ_KEYS)) };
  }
  if (answer.text) {
    const prose = answer.text.match(/health[\s_-]*factor[^0-9∞]{0,40}(∞|infinity|[0-9]+(?:\.[0-9]+)?)/i);
    if (prose) {
      const hf = readHf(prose[1]);
      if (hf) {
        const liq = /not\s+liquidatable|cannot be liquidated|safe from liquidation/i.test(answer.text) ? false : /\bliquidatable\b|can be liquidated/i.test(answer.text) ? true : null;
        return { ...hf, liquidatable: liq };
      }
    }
  }
  return null;
}

export interface HfVerdict {
  pass: boolean;
  reason: string;
}

export function judgeHf(expected: HfExpected, observed: HfObserved | null): HfVerdict {
  if (!observed) return { pass: false, reason: 'No health factor could be read from the answer.' };
  if (expected.healthFactor === null) {
    if (!observed.unbounded) return { pass: false, reason: `Expected no health factor (no debt), answered ${observed.healthFactor}.` };
  } else {
    if (observed.unbounded || observed.healthFactor === null) return { pass: false, reason: `Expected ${expected.healthFactor.toFixed(3)}, answered no health factor.` };
    const error = Math.abs(observed.healthFactor - expected.healthFactor) / expected.healthFactor;
    if (error > HF_TOLERANCE) return { pass: false, reason: `Expected ${expected.healthFactor.toFixed(3)}, answered ${observed.healthFactor} (off by ${(error * 100).toFixed(1)}%).` };
  }
  if (observed.liquidatable !== null && observed.liquidatable !== expected.liquidatable) {
    return { pass: false, reason: `Health factor right, but said liquidatable: ${observed.liquidatable}, expected ${expected.liquidatable}.` };
  }
  return { pass: true, reason: observed.liquidatable === null ? 'Health factor correct; liquidation not stated.' : 'Correct.' };
}
