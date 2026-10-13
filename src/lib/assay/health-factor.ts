/**
 * Health factor check, suite hf-venus-1.
 *
 * Health factor agents take a wallet address and read the position
 * themselves. So the check gives each agent real Venus Core Pool borrowers
 * on BNB Smart Chain and compares its answer with Pokter's own reading of
 * the same position, taken from Venus's accounting just before and just
 * after the agent replies (see venus.ts). A position can move between the
 * two, so an answer within tolerance of either reading passes.
 *
 * What this checks is whether the agent reports the health factor Venus
 * itself implies, and whether it calls liquidation correctly. It does not
 * check advice, timing or any action the agent might take.
 */
export const HF_SUITE_ID = 'hf-venus-1';

/** Relative tolerance on the health factor: rounding and oracle movement, not judgement. */
export const HF_TOLERANCE = 0.02;

export interface HfExpected {
  /** Null when there is no debt: the health factor is unbounded. */
  healthFactor: number | null;
  /** The same ratio on collateral factors, when known (see venus.ts). */
  borrowLimitRatio?: number | null;
  liquidatable: boolean;
}

/** The brief an agent receives: the account, the venue, and the answer shape. */
/**
 * The question. The account is named for agents that read the chain
 * themselves, and the same position is attached as rows (`collateral`,
 * `debt`, `prices`, read by Pokter from Venus at the block it is checked
 * against) for agents that compute from inputs. Both are judged against
 * Venus's own figure, so neither style is favoured.
 */
export function hfBrief(account: string, rows?: { collateral: Record<string, unknown>; debt: Record<string, unknown>; prices: Record<string, unknown> }): { text: string; data: Record<string, unknown> } {
  const text =
    `Read-only check. Report the current health factor of ${account} on Venus Core Pool (BNB Smart Chain mainnet), ` +
    'and whether it can be liquidated now. Execute no transaction. Reply with JSON only: ' +
    '{"health_factor": number or null when there is no debt, "liquidatable": boolean}.' +
    (rows ? ' The position is attached as collateral, debt and prices: amounts are USD values at the Venus oracle price, so every price is 1.' : '');
  const data: Record<string, unknown> = { suite: HF_SUITE_ID, address: account, account, wallet: account, protocol: 'venus', pool: 'core', chain_id: 56, answer_shape: { health_factor: 'number | null', liquidatable: 'boolean' } };
  if (rows) {
    Object.assign(data, rows);
    // Agents that take a flat JSON job input read it from task_description.
    data.task_description = JSON.stringify(rows);
  }
  return { text, data };
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

export type HfOutcome = 'correct' | 'borrow-limit' | 'wrong' | 'unreadable';

export interface HfVerdict {
  pass: boolean;
  outcome: HfOutcome;
  reason: string;
}

/** Three decimals at most: enough to compare, short enough to read. */
function fmt(value: number): string {
  return String(Number(value.toFixed(3)));
}

function relativeError(observed: number, expected: number): number {
  return Math.abs(observed - expected) / expected;
}

/**
 * Judge an answer against Pokter's readings around it (usually two: before
 * and after). It passes when it is within tolerance of any of them.
 */
export function judgeHf(readings: HfExpected[], observed: HfObserved | null): HfVerdict {
  if (!observed) return { pass: false, outcome: 'unreadable', reason: 'No health factor could be read from the answer.' };
  const noDebt = readings.every((r) => r.healthFactor === null);
  if (noDebt) {
    return observed.unbounded
      ? { pass: true, outcome: 'correct', reason: 'Correct: no debt.' }
      : { pass: false, outcome: 'wrong', reason: `Expected no health factor (no debt), answered ${fmt(observed.healthFactor ?? 0)}.` };
  }
  const values = readings.map((r) => r.healthFactor).filter((v): v is number => v !== null);
  const distinct = [...new Set(values.map((v) => v.toFixed(3)))];
  const shown = distinct.join(' to ');
  if (observed.unbounded || observed.healthFactor === null) return { pass: false, outcome: 'wrong', reason: `Expected ${shown}, answered no health factor.` };
  const best = Math.min(...values.map((v) => relativeError(observed.healthFactor!, v)));
  if (best > HF_TOLERANCE) {
    const limits = readings.map((r) => r.borrowLimitRatio).filter((v): v is number => typeof v === 'number');
    if (limits.some((v) => relativeError(observed.healthFactor!, v) <= HF_TOLERANCE)) {
      return {
        pass: false,
        outcome: 'borrow-limit',
        reason: `Answered ${fmt(observed.healthFactor)}, the borrowing-limit ratio on collateral factors. Venus liquidates on liquidation thresholds, which put this position at ${shown}.`,
      };
    }
    return { pass: false, outcome: 'wrong', reason: `Expected ${shown}, answered ${fmt(observed.healthFactor)} (off by ${(best * 100).toFixed(1)}%).` };
  }
  const liquidatable = readings.some((r) => r.liquidatable);
  const safe = readings.some((r) => !r.liquidatable);
  if (observed.liquidatable !== null && ((observed.liquidatable && !liquidatable) || (!observed.liquidatable && !safe))) {
    return { pass: false, outcome: 'wrong', reason: `Health factor right, but said liquidatable: ${observed.liquidatable}.` };
  }
  return { pass: true, outcome: 'correct', reason: observed.liquidatable === null ? 'Health factor correct; liquidation not stated.' : 'Correct.' };
}
