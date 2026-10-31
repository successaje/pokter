/** The fields of a run its standing rests on; `status` as any reader holds it. */
type Graded = { status: string; passed: number; total: number; ranAt: string };

/**
 * How long a passed answer check counts for.
 *
 * A pass is a claim about the agent as it was when it was graded, and an
 * operator can change the model, the prompt or the code behind an endpoint
 * at any time without the registry record changing. Free checks repeat
 * every few days (`RECHECK_MS`), so an agent that still answers is graded
 * again well inside this window; the pass that outlives it is one from an
 * agent that stopped answering, or a paid grade nobody has funded again.
 * Either way it is history, shown as history, and stops earning "Checked".
 */
export const CHECK_FRESH_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * Where an agent's latest answer check leaves it.
 *
 * - `passed`: every graded answer matched, within `CHECK_FRESH_DAYS`.
 * - `stale`: every graded answer matched, longer ago than that.
 * - `failed`: at least one graded answer did not match. Kept at any age: it
 *   is never a claim in the agent's favour.
 * - `ungraded`: the check ran but graded nothing (not askable, paid only,
 *   or nothing scorable came back).
 * - `not-run`: no check on record.
 *
 * One rule, read by the ladder, Discover, Compare and Studio, which each
 * carried their own copy of "passed" and none of them a date.
 */
export type CheckStanding = 'passed' | 'stale' | 'failed' | 'ungraded' | 'not-run';

export function checkStanding(run: Graded | null | undefined, now = Date.now()): CheckStanding {
  if (!run) return 'not-run';
  if (run.status !== 'checked' || run.total === 0) return 'ungraded';
  if (run.passed !== run.total) return 'failed';
  return now - Date.parse(run.ranAt) > CHECK_FRESH_DAYS * DAY_MS ? 'stale' : 'passed';
}

/** A pass that still counts: what earns "Checked" anywhere on Pokter. */
export function passedCheck(run: Graded | null | undefined, now = Date.now()): boolean {
  return checkStanding(run, now) === 'passed';
}
