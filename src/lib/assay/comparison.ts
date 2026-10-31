import { STATIC_SUITES, verdictClass } from './category-suites';
import { HF_SUITE_ID, HF_TOLERANCE } from './health-factor';
import { HF_COMPARABLE_MS } from './paid-hf-grade';
import { CHECK_FRESH_DAYS, checkStanding } from './standing';
import type { AssayRun } from './types';
import { V3_COMPARABLE_BLOCKS } from './v3-grade';

/**
 * A graded check as a comparison anyone can read: for each scenario, the
 * reference Pokter graded against, what the agent answered, how far apart
 * they are, and the result, with the network, the reference block, the
 * tolerance and when it was checked.
 *
 * One shape for the three kinds of check, so the agent page shows the same
 * evidence whichever applies. A result covers the scenarios it lists, at
 * the time it was graded; `scope` says so, so a matched check is never read
 * as the agent always being right.
 */
export type Tone = 'ok' | 'watch' | 'bad' | 'none';
export type ComparisonKind = 'health-factor' | 'position-range' | 'scenario';

export interface ComparisonRow {
  key: string;
  /** What was asked about: an account, a position, or a scenario id. */
  subject: string;
  /** The account, when the subject is one, for a link to the explorer. */
  account: string | null;
  /** The question in words, when Pokter publishes it. */
  task: string | null;
  reference: string;
  answer: string;
  difference: string;
  result: { label: string; tone: Tone };
  reason: string;
  /** The block Pokter read the reference at, when it was recorded. */
  block: string | null;
  /** When the reference was read, or the run graded. */
  readAt: string | null;
  jobId: string | null;
  /** The start of the agent's reply as received, so a reader can judge it rather than take the grade on trust. */
  reply: string | null;
}

export interface Comparison {
  kind: ComparisonKind;
  network: string;
  /** The column the agent's answer is compared with. */
  referenceLabel: string;
  referenceSource: string;
  tolerance: string;
  checkedAt: string;
  method: string;
  summary: { text: string; tone: Tone };
  scope: string;
  rows: ComparisonRow[];
}

/* Outcomes that are not the agent answering wrongly: read as "Did not match" they accuse it of a mistake it did not make. */
const UNSCORED: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Awaiting delivery', tone: 'none' },
  undelivered: { label: 'Not delivered', tone: 'bad' },
  'not-comparable': { label: 'Not comparable', tone: 'none' },
  'not-stated': { label: 'Not graded', tone: 'none' },
};

const HF_OUTCOME: Record<string, { label: string; tone: Tone }> = {
  correct: { label: 'Matches Venus', tone: 'ok' },
  'borrow-limit': { label: 'Borrowing-limit ratio', tone: 'watch' },
  wrong: { label: 'Does not match', tone: 'bad' },
  unanswered: { label: 'No health factor given', tone: 'bad' },
  unreadable: { label: 'No readable answer', tone: 'none' },
  ...UNSCORED,
};

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const percent = (value: number) => `${(value * 100).toFixed(value < 0.001 ? 2 : 1)}%`;
const words = (key: string) => key.replaceAll('_', ' ');

function shown(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function scenarioResult(pass: boolean, outcome: string): { label: string; tone: Tone } {
  if (pass) return { label: 'Matched', tone: 'ok' };
  return UNSCORED[outcome] ?? { label: 'Did not match', tone: 'bad' };
}

/**
 * Pokter's health factor readings for a row, from either shape a run records:
 * `{ before, after }` around a direct reply, or one flat reading for a paid
 * delivery graded later. A missing reading is unknown, never zero.
 */
function hfReadings(expected: unknown): { values: Array<number | null>; block: string | null; readAt: string | null } | null {
  const e = object(expected);
  if (!e) return null;
  const before = object(e.before);
  if (before) {
    const after = object(e.after);
    const values = [before, after].filter((r): r is Record<string, unknown> => r !== null && 'healthFactor' in r).map((r) => r.healthFactor as number | null);
    return { values, block: typeof before.block === 'string' ? before.block : null, readAt: null };
  }
  if (!('healthFactor' in e)) return null;
  return { values: [e.healthFactor as number | null], block: typeof e.block === 'string' ? e.block : null, readAt: typeof e.readAt === 'string' ? e.readAt : null };
}

function hfRow(result: AssayRun['results'][number], ranAt: string): ComparisonRow {
  const readings = hfReadings(result.expected);
  const observed = object(result.observed);
  const answered = observed?.unbounded === true ? null : typeof observed?.healthFactor === 'number' ? observed.healthFactor : undefined;
  const hf = (v: number | null) => (v === null ? 'No debt' : v.toFixed(3));
  /* Before and after are shown apart only when they differ: the same figure twice says nothing. */
  const distinct = readings ? [...new Set(readings.values.map(hf))] : [];
  const reference = distinct.length === 0 ? '—' : distinct.length === 1 ? distinct[0] : `${distinct[0]} before · ${distinct[1]} after`;
  let difference = '—';
  if (readings && answered !== undefined) {
    if (answered === null) difference = readings.values.includes(null) ? 'None' : '—';
    else {
      const gaps = readings.values.filter((v): v is number => typeof v === 'number' && v !== 0).map((v) => Math.abs(answered - v) / v);
      if (gaps.length > 0) difference = percent(Math.min(...gaps));
    }
  }
  return {
    key: result.scenario,
    subject: result.scenario,
    account: /^0x[0-9a-fA-F]{40}$/.test(result.scenario) ? result.scenario : null,
    task: 'The health factor and liquidation state of this Venus Core Pool account.',
    reference,
    answer: answered === undefined ? '—' : answered === null ? 'No debt' : answered.toFixed(3),
    difference,
    result: HF_OUTCOME[result.outcome] ?? HF_OUTCOME.unreadable,
    reason: result.reason,
    block: readings?.block ?? null,
    readAt: readings?.readAt ?? ranAt,
    jobId: result.jobId ?? null,
    reply: result.excerpt || null,
  };
}

const STATUS_WORDS: Record<string, string> = { 'in-range': 'In range', 'out-of-range': 'Out of range', closed: 'Closed' };

function positionRow(result: AssayRun['results'][number], ranAt: string): ComparisonRow {
  const expected = object(result.expected);
  const observed = object(result.observed);
  const status = (value: unknown) => (typeof value === 'string' ? (STATUS_WORDS[value] ?? value) : null);
  const reference = status(expected?.status) ?? (typeof expected?.positions === 'number' ? `${expected.positions} positions` : '—');
  const answer = status(observed?.status) ?? (typeof observed?.positions === 'number' ? `${observed.positions} named` : '—');
  const bothStated = status(expected?.status) !== null && status(observed?.status) !== null;
  return {
    key: result.scenario,
    subject: result.scenario,
    account: null,
    task: /^#\d+$/.test(result.scenario) ? 'Is this position earning at the current price?' : null,
    reference,
    answer,
    difference: bothStated ? (expected!.status === observed!.status ? 'None' : 'Differs') : '—',
    result: result.outcome === 'unanswered' ? { label: 'Not mentioned', tone: 'bad' } : scenarioResult(result.pass, result.outcome),
    reason: result.reason,
    block: typeof expected?.block === 'string' ? expected.block : null,
    readAt: typeof expected?.readAt === 'string' ? expected.readAt : ranAt,
    jobId: result.jobId ?? null,
    reply: result.excerpt || null,
  };
}

/* The same rule as `judgeStaticAnswer`: numbers within 0.5% (at least 0.01), words exactly. */
const numericTolerance = (wanted: number) => Math.max(0.01, Math.abs(wanted) * 0.005);

function scenarioRow(result: AssayRun['results'][number], ranAt: string, tasks: Map<string, string>): ComparisonRow {
  const expected = object(result.expected) ?? {};
  const observed = object(result.observed);
  const fields = (record: Record<string, unknown> | null, answered = false) =>
    record
      ? Object.keys(expected)
          .map((key) => {
            const value = record[key];
            /* A verdict word is read into its class before comparing; say so when the word is not the class itself. */
            const read = answered && key === 'verdict' && value !== undefined && value !== null ? verdictClass(value) : null;
            return `${words(key)} ${shown(value)}${read && read !== String(value).trim().toUpperCase() ? ` (read as ${read})` : ''}`;
          })
          .join(' · ')
      : '—';
  const differences = observed
    ? Object.entries(expected).flatMap(([key, wanted]) => {
        const got = observed[key];
        if (got === undefined || got === null) return [`${words(key)} missing`];
        if (typeof wanted === 'number') {
          const numeric = typeof got === 'number' ? got : Number(got);
          if (!Number.isFinite(numeric)) return [`${words(key)} not a number`];
          const gap = numeric - wanted;
          return Math.abs(gap) > numericTolerance(wanted) ? [`${words(key)} ${gap > 0 ? '+' : ''}${Number(gap.toPrecision(4))}`] : [];
        }
        /* The grader's own rule (`judgeStaticAnswer`): a verdict by its class, other words exactly, anything else by value. */
        if (typeof wanted === 'string') {
          const answered = key === 'verdict' ? verdictClass(got) : String(got).trim().toUpperCase();
          return answered === wanted.toUpperCase() ? [] : [`${words(key)} differs`];
        }
        return got === wanted ? [] : [`${words(key)} differs`];
      })
    : null;
  return {
    key: result.scenario,
    subject: result.scenario,
    account: null,
    task: tasks.get(result.scenario) ?? null,
    reference: fields(expected),
    answer: fields(observed, true),
    /* An answer that stated none of it has no difference to show, only absences: the result says why. */
    difference: differences === null || result.outcome === 'not-stated' ? '—' : differences.length === 0 ? 'None' : differences.join(' · '),
    result: scenarioResult(result.pass, result.outcome),
    reason: result.reason,
    block: null,
    readAt: ranAt,
    jobId: result.jobId ?? null,
    reply: result.excerpt || null,
  };
}

/**
 * The comparison for a checked run, or null when the run graded nothing to
 * compare (not asked, paid only, or no rows).
 *
 * A full pass older than `CHECK_FRESH_DAYS` keeps its rows and its date and
 * loses its green: it no longer earns "Checked" anywhere, and a summary that
 * still read as a clean pass would say otherwise.
 */
export function answerComparison(run: AssayRun | null, now = Date.now()): Comparison | null {
  const comparison = compare(run);
  if (!comparison || checkStanding(run, now) !== 'stale') return comparison;
  return { ...comparison, summary: { text: `${comparison.summary.text} That was over ${CHECK_FRESH_DAYS} days ago, so it no longer counts until it is graded again.`, tone: 'watch' } };
}

function compare(run: AssayRun | null): Comparison | null {
  if (!run || run.status !== 'checked' || run.results.length === 0) return null;
  const paid = run.via === 'paid-hire';
  const method = paid ? 'Graded from the work funded jobs delivered' : 'Asked directly, outside escrow';
  const scored = run.total;
  const staticSuite = Object.values(STATIC_SUITES).find((suite) => suite.id === run.suite) ?? null;

  if (run.suite === HF_SUITE_ID) {
    const borrowLimit = run.results.filter((r) => r.outcome === 'borrow-limit').length;
    const text = scored === 0
      ? run.detail ?? 'Delivered, but none of it could be scored.'
      : `Matched Venus on ${run.passed} of ${scored} live position${scored === 1 ? '' : 's'}${borrowLimit ? `; ${borrowLimit} answered with the borrowing-limit ratio instead` : ''}.`;
    return {
      kind: 'health-factor',
      network: 'BNB Chain',
      referenceLabel: 'Pokter’s reading',
      referenceSource: 'Venus Core Pool, read by Pokter from the chain',
      tolerance: paid
        ? `Within ${HF_TOLERANCE * 100}% of Pokter’s reading, taken within ${HF_COMPARABLE_MS / 60_000} minutes of the delivery`
        : `Within ${HF_TOLERANCE * 100}% of a reading taken just before or just after the reply`,
      checkedAt: run.ranAt,
      method,
      summary: { text, tone: scored === 0 ? 'none' : run.passed === scored ? 'ok' : run.results.some((r) => r.outcome === 'wrong') ? 'bad' : 'watch' },
      scope: scopeOf(scored, 'position'),
      rows: run.results.map((result) => hfRow(result, run.ranAt)),
    };
  }

  if (staticSuite) {
    const tasks = new Map(staticSuite.scenarios.map((scenario) => [scenario.id, scenario.brief.text]));
    const unstated = run.results.filter((r) => r.outcome === 'not-stated').length;
    const matched = `Matched ${run.passed} of ${scored} published scenario${scored === 1 ? '' : 's'}${unstated ? `; ${unstated} more not graded, stating none of what the check compares` : ''}.`;
    return {
      kind: 'scenario',
      network: 'None needed: the brief itself fixes the answer',
      referenceLabel: 'Published answer',
      referenceSource: 'The published scenario: what its own brief determines',
      tolerance: 'Numbers within 0.5% (at least 0.01); words exactly',
      checkedAt: run.ranAt,
      method,
      summary: { text: scored === 0 ? run.detail ?? 'Delivered, but none of it could be scored.' : matched, tone: scored === 0 ? 'none' : run.passed === scored ? 'ok' : 'bad' },
      scope: scopeOf(scored, 'scenario'),
      rows: run.results.map((result) => scenarioRow(result, run.ranAt, tasks)),
    };
  }

  return {
    kind: 'position-range',
    network: 'BNB Chain',
    referenceLabel: 'Pokter’s reading',
    referenceSource: 'PancakeSwap v3 positions, read by Pokter from the position manager and each pool',
    tolerance: `The same status as Pokter’s reading, taken within ${V3_COMPARABLE_BLOCKS.toLocaleString('en-US')} blocks of the delivery`,
    checkedAt: run.ranAt,
    method,
    summary: { text: scored === 0 ? run.detail ?? 'Delivered, but none of it could be scored.' : `Matched Pokter’s reading on ${run.passed} of ${scored} position${scored === 1 ? '' : 's'}.`, tone: scored === 0 ? 'none' : run.passed === scored ? 'ok' : 'bad' },
    scope: scopeOf(scored, 'position'),
    rows: run.results.map((result) => positionRow(result, run.ranAt)),
  };
}

function scopeOf(scored: number, noun: 'position' | 'scenario'): string {
  return scored === 0
    ? 'Nothing was scored, so this says nothing either way about the agent’s answers.'
    : `This covers the ${scored} ${noun}${scored === 1 ? '' : 's'} listed, when they were graded. It does not show the agent is right on every question.`;
}
