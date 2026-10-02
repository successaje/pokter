/**
 * Jobs that have been paid for and are not moving.
 *
 * Separated from the retry so it can be tested without a chain, the same
 * split `delivery-eligibility` makes beside `delivery-retry`.
 *
 * The retry already tries to rescue these every sweep. This exists because
 * trying is not the same as succeeding, and when it does not succeed nobody
 * finds out: a funded job goes quiet, the window closes twenty-four hours
 * later, and the buyer is left to notice an expiry on their own. That has
 * already happened — four escrows reached expiry undelivered, and the first
 * anyone knew of it was reading the chain days afterwards.
 *
 * An hour is the threshold because delivery takes seconds when it works.
 * Anything still unmoved an hour after funding is not slow, it is stuck,
 * and there are twenty-three hours left to do something about it.
 */

/** How long a funded job may sit before it counts as stuck. */
export const STUCK_AFTER_MS = 60 * 60 * 1000;

export interface StuckCandidate {
  jobId: string;
  agentName: string;
  /** Epoch ms the escrow was funded. */
  fundedAtMs: number;
  /** Epoch ms the escrow expires and becomes reclaimable. */
  expiresAtMs: number;
  /** Chain status, re-read rather than taken from the index. */
  statusName: string;
}

export interface StuckJob extends StuckCandidate {
  stuckForMs: number;
  /** How long is left to rescue it before the buyer has to reclaim instead. */
  remainingMs: number;
}

/**
 * Which jobs to raise, given what has already been raised.
 *
 * Only jobs still inside their window. An expired one is past saving and
 * belongs to the buyer to reclaim; alerting on it would be telling somebody
 * about a fire after the building has gone, every two hours, forever.
 *
 * `alreadyAlerted` makes this idempotent across sweeps. Without it a single
 * stuck job would send a message every two hours for a day, which trains
 * the reader to ignore the channel — and this channel exists for the one
 * message that matters.
 */
export function stuckJobsNeedingAlert(
  candidates: StuckCandidate[],
  now: number,
  alreadyAlerted: ReadonlySet<string>,
): StuckJob[] {
  return candidates
    .filter((job) => job.statusName === 'FUNDED')
    .filter((job) => !alreadyAlerted.has(job.jobId))
    .filter((job) => now - job.fundedAtMs >= STUCK_AFTER_MS)
    .filter((job) => job.expiresAtMs > now)
    .map((job) => ({
      ...job,
      stuckForMs: now - job.fundedAtMs,
      remainingMs: job.expiresAtMs - now,
    }))
    .sort((a, b) => a.remainingMs - b.remainingMs);
}

/** `2h`, `3h 20m` — enough precision to judge urgency, no more. */
export function describeDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
