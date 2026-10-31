import { readDeliveredAnswer } from './answer';
import { GRID_METHOD, GRID_NOT_COVERED, gridChecks, isGridPlan } from './grid-plan-check';
import { HEALTH_METHOD, HEALTH_NOT_COVERED, healthChecks, isHealthReport } from './health-plan-check';
import { check, deliveredObject, utcTime, type Obj, type PlanCheck, type PlanCheckReport, type PlanKind } from './plan-check-kit';
import { RANGE_METHOD, RANGE_NOT_COVERED, isRangePlan, rangeChecks } from './range-plan-check';
import { TOKEN_METHOD, TOKEN_NOT_COVERED, isTokenReport, tokenChecks } from './token-plan-check';
import { YIELD_METHOD, YIELD_NOT_COVERED, isYieldPlan, yieldChecks } from './yield-plan-check';

export type { PlanCheck, PlanCheckOutcome, PlanCheckReport, PlanKind } from './plan-check-kit';

/**
 * Checks on a delivered answer, chosen by what the answer is.
 *
 * One entry per kind of answer, each with its own rules and its own
 * version, so adding a kind is adding an entry here and a file beside this
 * one — not a special case in a page. An answer is matched by its shape
 * rather than by its agent's listed category: the category is Pokter's
 * reading of a registration, the shape is what was actually delivered, and
 * an agent filed under one category can deliver another kind of answer.
 *
 * Every kind also gets the basics any answer can be held to: that it says
 * when its figures were read, and where from. An answer of a kind with no
 * entry gets only those, and says that its substance was not checked.
 */

interface PlanEntry {
  kind: PlanKind;
  method: string;
  label: string;
  matches: (o: Obj) => boolean;
  run: (o: Obj, brief: string | null) => PlanCheck[];
  notCovered: string[];
}

/* Order matters where shapes overlap: a health report can list markets, a grid can mention a pool. */
const ENTRIES: PlanEntry[] = [
  { kind: 'health', method: HEALTH_METHOD, label: 'Health report', matches: isHealthReport, run: healthChecks, notCovered: HEALTH_NOT_COVERED },
  { kind: 'range', method: RANGE_METHOD, label: 'Position range review', matches: isRangePlan, run: (o) => rangeChecks(o), notCovered: RANGE_NOT_COVERED },
  { kind: 'grid', method: GRID_METHOD, label: 'Grid plan', matches: isGridPlan, run: gridChecks, notCovered: GRID_NOT_COVERED },
  { kind: 'yield', method: YIELD_METHOD, label: 'Yield comparison', matches: isYieldPlan, run: yieldChecks, notCovered: YIELD_NOT_COVERED },
  { kind: 'token', method: TOKEN_METHOD, label: 'Token safety report', matches: isTokenReport, run: tokenChecks, notCovered: TOKEN_NOT_COVERED },
];

export const PLAN_KINDS: ReadonlyArray<{ kind: PlanKind; method: string; label: string }> = ENTRIES.map(({ kind, method, label }) => ({ kind, method, label }));

export const BASICS_METHOD = 'answer-basics@1';

/** Sources named anywhere in the answer: a yield comparison names them venue by venue. */
function nestedSources(value: unknown, depth = 0): number {
  if (depth > 3) return 0;
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + nestedSources(item, depth + 1), 0);
  if (!value || typeof value !== 'object') return 0;
  return Object.entries(value).reduce<number>((sum, [key, v]) => sum + (/^(data_)?sources?$/.test(key) ? (Array.isArray(v) ? v.length : v ? 1 : 0) : nestedSources(v, depth + 1)), 0);
}

function basics(object: Obj): PlanCheck[] {
  // Read the way the answer view reads it, so "dated" here and "Data read" there never disagree.
  const answer = readDeliveredAnswer(JSON.stringify({ response: { content: object } }));
  const nested = answer.sources.length ? 0 : nestedSources(object);
  return [
    check(
      'answer.dated',
      'Says when its figures were read',
      'Whether the answer names the block or time its data was read at.',
      answer.asOf ? 'passed' : 'failed',
      answer.asOf
        ? `Read ${[answer.asOf.block && `at block ${answer.asOf.block}`, answer.asOf.time && `at ${utcTime(answer.asOf.time)}`].filter(Boolean).join(', ')}.`
        : 'It does not name the block or time its data was read at, so its figures cannot be compared with the chain later.',
    ),
    check(
      'answer.sources',
      'Names its sources',
      'Whether the answer says where its figures came from.',
      answer.sources.length || nested ? 'passed' : 'failed',
      answer.sources.length
        ? `${answer.sources.length === 1 ? 'One source' : `${answer.sources.length} sources`} named.`
        : nested
          ? `${nested === 1 ? 'One source' : `${nested} sources`} named beside the figures they back.`
          : 'It does not say where its figures came from.',
    ),
  ];
}

/**
 * The checks for one delivery, or null when there is no structured answer
 * to hold to anything. `brief` is the task as the agent received it, when
 * it may be shown; checks that compare with it say so when it is absent.
 */
export function checkDeliveredPlan(manifestText: string, brief: string | null = null): PlanCheckReport | null {
  const object = deliveredObject(manifestText);
  if (!object) return null;
  const entry = ENTRIES.find((e) => e.matches(object));
  if (!entry) {
    return {
      kind: null,
      method: BASICS_METHOD,
      label: 'Answer',
      checks: basics(object),
      notCovered: ['Whether the answer is right. Pokter has no check for this kind of answer yet beyond the basics above.'],
    };
  }
  return { kind: entry.kind, method: entry.method, label: entry.label, checks: [...entry.run(object, brief), ...basics(object)], notCovered: entry.notCovered };
}

export function planCheckCounts(report: PlanCheckReport): Record<PlanCheck['outcome'], number> {
  const counts = { passed: 0, failed: 0, 'not-verified': 0, 'not-applicable': 0 };
  for (const c of report.checks) counts[c.outcome] += 1;
  return counts;
}
