/**
 * When a sweep is due, and when its absence is worth an alert.
 *
 * The sweep ran from a GitHub Actions cron every two hours, and GitHub runs
 * scheduled workflows late or not at all under load: on 15 October it ran
 * at 04:40 and 11:30 only, and the 11:30 run failed, so production went
 * eight hours without a probe. Every availability figure is only as current
 * as the last sweep. The server now schedules its own sweeps from these
 * rules, and GitHub's cron stays as a backup that skips when one is recent.
 */

export const SWEEP_INTERVAL_MS = 2 * 60 * 60 * 1000;
/** A backup trigger inside this window finds a recent sweep and stands down. */
export const RECENT_SWEEP_MS = 90 * 60 * 1000;
/** No successful sweep for this long is an outage of the evidence layer. */
export const STALE_ALERT_MS = 6 * 60 * 60 * 1000;

const age = (iso: string | null, now: number) => (iso ? now - Date.parse(iso) : Number.POSITIVE_INFINITY);

export function sweepDue(lastFinishedAt: string | null, now: number): boolean {
  return age(lastFinishedAt, now) >= SWEEP_INTERVAL_MS;
}

export function sweepRecent(lastFinishedAt: string | null, now: number): boolean {
  return age(lastFinishedAt, now) < RECENT_SWEEP_MS;
}

/**
 * Alert once per outage: when sweeps have been missing for six hours and
 * no alert has been sent since the last successful one.
 */
export function staleAlertDue(lastFinishedAt: string | null, alertedAt: string | null, now: number): boolean {
  if (age(lastFinishedAt, now) < STALE_ALERT_MS) return false;
  return !alertedAt || (lastFinishedAt !== null && Date.parse(alertedAt) < Date.parse(lastFinishedAt));
}
