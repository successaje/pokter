import { TimedOut, withTimeout } from '@/lib/net/bounded';

/**
 * One budget for a whole sweep run, shared by every step in it.
 *
 * Step one of this repair gave each outbound call a timeout; step two gave
 * the probing a batch and a clock. Neither bounds the *run*: the sweep route
 * is about twenty-five sequential steps, each already caught so its failure
 * cannot cost the measurements, and twenty-five bounded steps still add up to
 * an unbounded run. On one shared CPU, inside the web process, that is the
 * fault that took pokter.xyz off the air on 19 October — not any single slow
 * call, but the absence of anything that says when the run is over.
 *
 * So the run gets a deadline at the top and every step asks this object for
 * permission. A step with no time left does not start, and one that does
 * start may not outlive the run. What a step may spend is whatever remains,
 * rather than a number of its own, because a per-step allowance that cannot
 * see the clock is how twenty-five budgets became no budget.
 *
 * Cutting from the bottom is deliberate and matches the order the route
 * already argues for. Its own comments put the slow optional work last —
 * "nothing above depends on it and a slow lookup must not cost the
 * measurements" — so a deadline reached mid-run sheds exactly what that
 * reasoning says is sheddable, and the measurements are always done.
 *
 * What this cannot do is stop work already in flight. `withTimeout` bounds
 * the waiting, not the promise, and threading an `AbortSignal` through all
 * twenty-five would be a far larger change than the outage warrants. The
 * bound that holds is each call's own: after the run answers, what continues
 * in the background is at most one outbound timeout per call still open,
 * instead of the unbounded tail it was before.
 */
export interface RunBudget {
  /** Milliseconds left, never negative. */
  remaining(): number;
  /** True once there is no time left to start anything. */
  spent(): boolean;
  /**
   * Run one step of the sweep, or skip it if the run is out of time.
   *
   * Failure returns null, which is the contract the route already had from
   * `.catch(() => null)` on every one of these steps: a step that cannot
   * run is a gap in that run's report, never a failed sweep.
   */
  step<T>(label: string, work: () => Promise<T> | T): Promise<T | null>;
  /** What the run did not get to, so a squeezed tail is visible, not guessed. */
  report(): RunBudgetReport;
}

export interface RunBudgetReport {
  /** Steps that never started, in the order the run reached them. */
  skipped: string[];
  /** Steps that started and were still waiting when the run ran out. */
  timedOut: string[];
  /** How long the run actually took, against the budget it was given. */
  usedMs: number;
  budgetMs: number;
}

export function runBudget(totalMs: number, clock: () => number = Date.now): RunBudget {
  const startedAt = clock();
  const skipped: string[] = [];
  const timedOut: string[] = [];
  const remaining = () => Math.max(0, totalMs - (clock() - startedAt));

  return {
    remaining,
    spent: () => remaining() === 0,

    async step<T>(label: string, work: () => Promise<T> | T): Promise<T | null> {
      const left = remaining();
      if (left === 0) {
        skipped.push(label);
        return null;
      }

      try {
        /* An async wrapper, so a step that throws synchronously is caught
           here rather than escaping the budget and failing the run. */
        return await withTimeout((async () => work())(), label, left);
      } catch (error) {
        if (error instanceof TimedOut) timedOut.push(label);
        return null;
      }
    },

    report: () => ({
      skipped: [...skipped],
      timedOut: [...timedOut],
      usedMs: clock() - startedAt,
      budgetMs: totalMs,
    }),
  };
}
