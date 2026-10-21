/**
 * Which jobs a run reconciles, and why not simply "the stalest".
 *
 * `reconcileJobs` was every job Pokter has ever brokered, every run, four at
 * a time: an escrow read each, often a deliverable read, and for a row with
 * a registry owner a lookup and a mail send as well. Its own comment said so
 * — "it was every job Pokter has ever brokered, at once" — and the cost grows
 * with the job count forever. On 21 October it used the run's whole remaining
 * budget and the eighteen steps after it were skipped, among them the ones
 * that detect hires and retry stuck deliveries.
 *
 * So a run takes a bounded batch. The question is which, and the obvious
 * answer is wrong.
 *
 * Ordering by "least recently succeeded" puts a job that cannot succeed at
 * the front for ever: its success time never advances, so it is always the
 * stalest, and it is picked again every run while the jobs behind it are
 * never reached. That is head-of-line blocking dressed as fairness, and the
 * failure it produces — a backlog that never drains while the scheduler
 * reports progress — is the one this module exists to prevent.
 *
 * So the order is **least recently attempted**, and an attempt counts
 * whether or not it worked. A job that fails goes to the back of the queue
 * exactly like one that succeeded, because what it has consumed is a turn.
 * Backoff then reduces how often a repeatedly failing job takes a turn at
 * all, so a permanently broken row costs a slot occasionally rather than
 * every run.
 *
 * `lastSucceededAt` is still recorded, because "when did this last actually
 * reconcile" is the question an operator asks and the one a failed attempt
 * must not answer. It is for reporting and staleness, never for ordering.
 */

/** What a run needs to remember about a job between runs. */
export interface JobAttempt {
  /** When a run last tried, successful or not. The ordering key. */
  lastAttemptedAt: string | null;
  /** When a run last succeeded. Reporting only — never the ordering key. */
  lastSucceededAt: string | null;
  /** Consecutive failures since the last success, for the backoff. */
  failures: number;
}

/**
 * How many jobs a run reconciles.
 *
 * At four concurrent and roughly a second of reads apiece, forty is a few
 * tens of seconds — comfortably inside an ordinary step's share of a 240s
 * run, with the rest left for the steps that follow. The roster is worked
 * through over successive runs rather than in one, the same way the probing
 * batch already is.
 */
export const RECONCILE_PER_RUN = 40;

/**
 * Stop starting new reconciliations this far before the step's time is up.
 *
 * A job costs an escrow read and sometimes a mail send, so one started with
 * two seconds left is one that will be cut off halfway. Leaving a margin
 * means the step finishes the work it began rather than being interrupted,
 * and the jobs it did not reach keep their place in the queue for the next
 * run — which is the point of ordering by attempt time.
 */
export const RECONCILE_DEADLINE_SLACK_MS = 5_000;

/** The first retry waits one sweep interval; the longest waits six hours. */
export const RETRY_BASE_MS = 10 * 60_000;
export const RETRY_CEILING_MS = 6 * 60 * 60_000;

/**
 * How long a job waits after `failures` consecutive failures.
 *
 * Doubling, capped. The cap matters as much as the growth: without it a row
 * that failed twenty times would be effectively abandoned, and a job whose
 * escrow read fails because an RPC was down for an hour should come back.
 */
export function backoffMs(failures: number): number {
  if (failures <= 0) return 0;
  const grown = RETRY_BASE_MS * 2 ** (failures - 1);
  return Math.min(grown, RETRY_CEILING_MS);
}

/** Whether a job may be attempted now, given what happened last time. */
export function isDue(attempt: JobAttempt | undefined, now: number): boolean {
  if (!attempt || attempt.lastAttemptedAt === null) return true;
  const since = Date.parse(attempt.lastAttemptedAt);
  if (!Number.isFinite(since)) return true;
  return now - since >= backoffMs(attempt.failures);
}

/**
 * The batch this run should reconcile: due jobs, least recently attempted
 * first, bounded by `limit`.
 *
 * A job never attempted sorts first — it has no readings at all, which is
 * the strongest claim on a turn. Ties break on the key so the order is
 * deterministic, because a test that depends on map iteration order is a
 * test that passes until it doesn't.
 */
export function dueForReconcile<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  attempts: ReadonlyMap<string, JobAttempt>,
  now: number,
  limit: number = RECONCILE_PER_RUN,
): T[] {
  const at = (item: T) => {
    const a = attempts.get(keyOf(item));
    if (!a || a.lastAttemptedAt === null) return Number.NEGATIVE_INFINITY;
    const parsed = Date.parse(a.lastAttemptedAt);
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
  };

  return items
    .filter((item) => isDue(attempts.get(keyOf(item)), now))
    .sort((a, b) => at(a) - at(b) || keyOf(a).localeCompare(keyOf(b)))
    .slice(0, Math.max(0, limit));
}

/**
 * The attempt record after a run tried a job.
 *
 * A failure advances `lastAttemptedAt` and leaves `lastSucceededAt` alone,
 * which is the whole point: the turn is spent, and nothing claims the job
 * reconciled. A success resets the failure count, so one bad hour does not
 * leave a healthy job in a long backoff.
 */
export function afterAttempt(
  previous: JobAttempt | undefined,
  outcome: 'ok' | 'failed',
  at: string,
): JobAttempt {
  const failures = outcome === 'ok' ? 0 : (previous?.failures ?? 0) + 1;
  return {
    lastAttemptedAt: at,
    lastSucceededAt: outcome === 'ok' ? at : (previous?.lastSucceededAt ?? null),
    failures,
  };
}
