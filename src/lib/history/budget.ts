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
 * What this cannot do by itself is stop work already in flight: `withTimeout`
 * bounds the waiting, not the promise. For the sweep's own calls that gap is
 * closed separately — the signal the route builds is threaded into the prober
 * and the quote negotiation, which is the bulk of a run's outbound volume, so
 * cancelling genuinely cancels them. For the follow-on steps it is not, and
 * the bound that holds there is each call's own timeout: after the run
 * answers, what continues in the background is at most one timeout per call
 * still open, instead of the unbounded tail it was before.
 */
export interface RunBudget {
  /** Milliseconds left, never negative. */
  remaining(): number;
  /**
   * What an ordinary step may spend: what remains, less the reservation that
   * only critical steps may draw on.
   */
  spendable(): number;
  /** True once there is no time left to start anything. */
  spent(): boolean;
  /**
   * Run one step of the sweep, or skip it if the run is out of time.
   *
   * Failure returns null, which is the contract the route already had from
   * `.catch(() => null)` on every one of these steps: a step that cannot
   * run is a gap in that run's report, never a failed sweep.
   */
  step<T>(label: string, work: () => Promise<T> | T, options?: StepOptions): Promise<T | null>;
  /** What the run did not get to, so a squeezed tail is visible, not guessed. */
  report(): RunBudgetReport;
}

export interface StepOptions {
  /**
   * A step the run exists to perform, which an earlier step may not starve.
   *
   * Critical steps may draw on the reservation; ordinary ones may not. Mark
   * a step critical when skipping it has a consequence outside this process
   * — a hire undetected, a stuck delivery never retried, a seller never
   * told — rather than a figure being one run out of date.
   */
  critical?: boolean;
  /**
   * The most this step may spend, whatever else is left.
   *
   * Without it the reservation is shared, so the first critical step to hang
   * consumes the lot and starves the rest: the original fault with the
   * victims narrowed from eighteen steps to three. A cap makes each critical
   * step survivable on its own.
   */
  maxMs?: number;
}

export interface RunBudgetReport {
  /** Steps that never started, in the order the run reached them. */
  skipped: string[];
  /** Steps that started and were still waiting when the run ran out. */
  timedOut: string[];
  /**
   * Steps that threw. Their result was null like a skipped step's, so the
   * work silently did not happen and nothing said so.
   */
  failed: string[];
  /**
   * Every step that started, with how long it took, in run order. The run's
   * total said the sweep used 236s of 240s and the measurement 18s of it;
   * where the other 218s went could not be read from anything.
   */
  steps: Array<{ label: string; ms: number; outcome: 'ok' | 'failed' | 'timed-out' }>;
  /** Of the lost steps, the ones marked critical: this run did not do its job. */
  criticalMissed: string[];
  /** How long the run actually took, against the budget it was given. */
  usedMs: number;
  budgetMs: number;
  /** What was held back for critical steps, so a report reads against it. */
  reservedMs: number;
}

/**
 * Whether there is still time to start something with a side effect.
 *
 * Pure and separate so it can be tested, because the sequence that matters
 * is not testable through the loop that uses it: check the clock, make a
 * network call that returns after the deadline, then submit a transaction
 * anyway. A check at the top of a loop says nothing about the moment before
 * the write, so the loop asks twice and this is what it asks.
 *
 * No deadline means no limit, which is the behaviour every existing caller
 * had before this existed.
 */
export function mayStartSideEffect(deadlineAt: number | undefined, now: number = Date.now()): boolean {
  return deadlineAt === undefined || now < deadlineAt;
}

export function runBudget(totalMs: number, clock: () => number = Date.now, reserveMs = 0): RunBudget {
  const startedAt = clock();
  const skipped: string[] = [];
  const timedOut: string[] = [];
  const failed: string[] = [];
  const steps: RunBudgetReport['steps'] = [];
  const criticalMissed: string[] = [];
  const remaining = () => Math.max(0, totalMs - (clock() - startedAt));
  /* Never reserve the whole run: a reservation larger than the budget would
     stop every ordinary step from starting, which is the same starvation
     with the victims swapped. */
  const reserved = Math.max(0, Math.min(reserveMs, totalMs));
  const spendable = () => Math.max(0, remaining() - reserved);

  return {
    remaining,
    spendable,
    spent: () => remaining() === 0,

    async step<T>(label: string, work: () => Promise<T> | T, options?: StepOptions): Promise<T | null> {
      const critical = options?.critical === true;
      /* A critical step may draw on the reservation; an ordinary one sees
         only what is left beyond it, so it cannot spend what was held back. */
      const available = critical ? remaining() : spendable();
      /* And no step outspends its own cap, so one that hangs cannot take the
         share the steps after it were going to use. */
      const left = options?.maxMs === undefined ? available : Math.min(available, Math.max(0, options.maxMs));
      if (left === 0) {
        skipped.push(label);
        if (critical) criticalMissed.push(label);
        return null;
      }

      const started = clock();
      try {
        /* An async wrapper, so a step that throws synchronously is caught
           here rather than escaping the budget and failing the run. */
        const result = await withTimeout((async () => work())(), label, left);
        steps.push({ label, ms: clock() - started, outcome: 'ok' });
        return result;
      } catch (error) {
        const outcome = error instanceof TimedOut ? 'timed-out' : 'failed';
        (outcome === 'timed-out' ? timedOut : failed).push(label);
        steps.push({ label, ms: clock() - started, outcome });
        if (critical) criticalMissed.push(label);
        return null;
      }
    },

    report: () => ({
      skipped: [...skipped],
      timedOut: [...timedOut],
      failed: [...failed],
      criticalMissed: [...criticalMissed],
      steps: steps.map((s) => ({ ...s })),
      usedMs: clock() - startedAt,
      budgetMs: totalMs,
      reservedMs: reserved,
    }),
  };
}

/**
 * The few steps that took most of a run, for the scheduler's one log line:
 * " · slowest listings 81s, categoryChecks 40s, walletActivity 22s".
 * Only steps over a second, because the point is where the time went.
 */
export function slowest(steps: Array<{ label: string; ms: number }> | undefined, count = 5): string {
  const top = (steps ?? []).filter((s) => s.ms >= 1000).sort((a, b) => b.ms - a.ms).slice(0, count);
  return top.length ? ` · slowest ${top.map((s) => `${s.label} ${Math.round(s.ms / 1000)}s`).join(', ')}` : '';
}
