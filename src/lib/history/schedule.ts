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

/*
 * One sweep every ten minutes, each one bounded.
 *
 * This was two hours, because a sweep walked the entire roster and that is
 * not something to do often. It is also not something to do at all inside
 * the web process: on 19 October the roster had grown past what one run
 * could finish, and the run that never finished took the site with it —
 * pokter.xyz served for a few minutes after each boot and then stopped
 * answering, on one shared CPU with the sweep still going.
 *
 * A sweep now measures a batch of the agents whose readings are oldest, under
 * a wall-clock budget (`SWEEP_BUDGET_MS` in ./sweep), so the interval is free
 * to be short. Ten minutes at `SWEEP_MAX_AGENTS` apiece covers a roster of
 * three hundred in about an hour — better than the two-hourly full sweep it
 * replaces, and no single run can occupy the process.
 */
export const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
/**
 * A backup trigger inside this window finds a recent sweep and stands down.
 *
 * Just under the interval, so GitHub's cron still skips a sweep that has only
 * just run, without suppressing the next scheduled batch.
 */
export const RECENT_SWEEP_MS = 8 * 60 * 1000;
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

/**
 * Who a bounded sweep measures: the agents whose readings are oldest.
 *
 * Staleness, rather than a saved position in the roster, is what makes
 * successive bounded runs add up to coverage. A cursor would have to survive
 * restarts and a roster that changes shape between runs; "least recently
 * probed" needs neither, is self-correcting after any gap in sweeps, and
 * spends the budget where the record is least current.
 *
 * Agents with no reading at all sort first, and ties keep their roster order —
 * `Array.prototype.sort` is stable — so among never-probed agents the tiers
 * `buildRoster` puts first (listed, enrolled, quoted, hired) still go first,
 * ahead of the registry's long tail.
 */
export function sweepBatch<T extends { tokenId: string }>(
  roster: T[],
  lastProbedAt: Map<string, string>,
  maxAgents: number,
): T[] {
  if (maxAgents <= 0) return [];
  const staleness = (entry: T) => lastProbedAt.get(entry.tokenId) ?? '';
  return [...roster]
    .sort((a, b) => (staleness(a) < staleness(b) ? -1 : staleness(a) > staleness(b) ? 1 : 0))
    .slice(0, maxAgents);
}

/** Registry agents listed per call, which is the listing API's own page size. */
export const SWEEP_REGISTRY_PAGE = 50;

/**
 * Which page of the registry this run reads, rotated by the clock.
 *
 * A sweep used to walk `registryDepth` in one run — three sequential listing
 * calls per chain. That was defensible every two hours and is not every ten
 * minutes: it would be six times the calls to an API the sweep elsewhere
 * takes care not to hammer, for a listing that barely changes between runs.
 *
 * So each run reads one page and the page advances with the schedule, which
 * costs a third of what a single old run did while covering the same depth
 * over three runs. Nothing is lost by not re-reading a page: the registry
 * tier exists to *discover* agents, and the store remembers every agent it
 * has ever probed, so one sighting puts an agent on the roster permanently.
 * A newly sighted agent has no reading at all, so `sweepBatch` puts it at the
 * very front of the next batch.
 *
 * Derived from the clock rather than a stored cursor so that it needs no
 * persistence and cannot be left stuck by a restart.
 */
export function registryPageOffset(
  now: number,
  depth: number,
  pageSize = SWEEP_REGISTRY_PAGE,
): number {
  const pages = Math.max(1, Math.ceil(depth / pageSize));
  return (Math.floor(now / SWEEP_INTERVAL_MS) % pages) * pageSize;
}
