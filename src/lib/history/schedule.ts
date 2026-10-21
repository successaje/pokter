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

/**
 * How often the scheduler wakes up, which is what actually sets the cadence.
 *
 * Here rather than in ./scheduler because `SWEEP_INTERVAL_MS` only means
 * anything in relation to it, and getting that relation wrong has now cost
 * two releases. A test asserts it.
 */
export const SWEEP_TICK_MS = 10 * 60 * 1000;

/**
 * When the first tick fires after boot, earlier than the rest.
 *
 * `setInterval` is anchored to boot, not to this timer, so the gap between
 * the first tick and the second is `SWEEP_TICK_MS` minus this — the tightest
 * gap in the schedule, and the one the floor below has to clear.
 */
export const SWEEP_FIRST_TICK_MS = 60_000;

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
 * a wall-clock budget (`SWEEP_BUDGET_MS` below), so the interval is free
 * to be short. `SWEEP_TICK_MS` at `SWEEP_MAX_AGENTS` apiece covers a roster
 * of three hundred in about an hour — better than the two-hourly full sweep
 * it replaces, and no single run can occupy the process.
 *
 * **This is a floor, not the cadence.** The cadence is `SWEEP_TICK_MS`: the
 * scheduler sweeps on every tick, and this only stops it sweeping twice if
 * ticks ever bunch up. It therefore has to sit clear of the tightest gap
 * between ticks, which is the first one — and it did not. Set equal to the
 * tick, every tick landed a hair short of due and the sweep slipped to the
 * one after, so a ten-minute schedule ran at eighteen. Pacing from a run's
 * start rather than its finish fixed half of that; the other half is that a
 * threshold equal to the gap it is tested against is decided by timer drift,
 * and drifts silently towards half the intended rate.
 */
export const SWEEP_INTERVAL_MS = 7 * 60 * 1000;
/**
 * A backup trigger inside this window finds a recent sweep and stands down.
 *
 * At or under `SWEEP_INTERVAL_MS`, and that bound is not cosmetic: this is
 * checked in the route, which the scheduler goes through, so a window longer
 * than the scheduler's own floor would have the route refusing sweeps the
 * scheduler had correctly decided were due. It was eight minutes against a
 * ten-minute floor, which was safe only by coincidence; the floor is now
 * seven, and a test holds the relationship.
 *
 * The cost of the smaller window is that GitHub's two-hourly backup may
 * sweep a few minutes after a scheduled one rather than standing down. That
 * is one extra bounded run every couple of hours, against the alternative of
 * the route silently halving the cadence again.
 */
export const RECENT_SWEEP_MS = 6 * 60 * 1000;
/**
 * A whole sweep run: the measurements and everything that rides on them.
 *
 * Two constraints fix this number, and both are why it lives beside the
 * interval rather than in the route. It must sit below the platform's
 * `maxDuration` of 300s, so the route *answers* rather than being cut off
 * with nothing to report. And it must sit below half `SWEEP_TICK_MS`, so
 * two runs can never meet on the one CPU that also serves the site — the
 * route's `sweepRunning` guard would turn the second away, but a guard that
 * is load-bearing every tick is a design relying on being refused.
 *
 * Of this, the two sweeps may spend `SWEEP_BUDGET_MS` and the testnet pass's
 * share on probing; the rest is for the twenty-odd steps after them. At a
 * ten-minute interval that is more follow-on time per hour than the single
 * two-hourly run it replaces had in total.
 *
 * A run that reaches the end of it sheds its tail, in the order the route's
 * steps already appear: the measurements first, the slow optional lookups
 * last. The run reports what it shed, so a tail that is squeezed every time
 * is visible rather than silently never happening.
 */
export const SWEEP_RUN_BUDGET_MS = 240_000;

/**
 * Held back from the run for the steps that must not be skipped.
 *
 * On 21 October a run reported `200` having spent 240s of 240s, timed out on
 * `reconcileJobs`, and skipped the eighteen steps after it — among them
 * `hireWatch`, `deliveryRetries`, `sellerNotices` and `stuckJobs`. A hire
 * went undetected and a stuck delivery went unretried because an earlier
 * step was handed the whole remainder and used it.
 *
 * The budget sheds work from the bottom, and its own note argues that is
 * right because the route puts optional work last. That was true when
 * written and stopped being true as maintenance accumulated below the cut
 * line. Those four steps have consequences outside this process; none is
 * sheddable.
 *
 * 40s of 240s, leaving 200s for everything ordinary. Runs were finishing in
 * 185–193s, so the reservation costs nothing in the normal case and bites
 * only when a run is already overrunning — which is when the critical steps
 * were being lost.
 */
export const SWEEP_CRITICAL_RESERVE_MS = 40_000;

/**
 * The most any one critical step may spend.
 *
 * The reservation is shared, so without a cap the first critical step to
 * hang consumes all 40s and starves the other three — the same fault with
 * the victims narrowed from eighteen to three. A quarter each, so one
 * hanging step costs its own turn and nobody else's.
 */
export const SWEEP_CRITICAL_STEP_MS = SWEEP_CRITICAL_RESERVE_MS / 4;

/*
 * What bounds a single sweep. Here rather than beside `runSweep` because
 * `./sweep` is `server-only` and these numbers only mean anything in relation
 * to the interval and the run budget above — a relation worth asserting in a
 * test, which cannot import a server-only module.
 */
/**
 * Agents measured per run.
 *
 * A sweep probed every agent on its roster in one invocation. That was fine
 * while the roster was the four category listings — about eighty agents — and
 * stopped being fine as the roster grew: by 19 October a run no longer
 * finished, and because it runs inside the web process on one shared CPU, the
 * run that did not finish stopped the site answering. `[warmup] registry
 * cache primed in 187.4s` was the same symptom from the same cause.
 *
 * The fix is not a bigger machine, it is a run that ends. Coverage is now the
 * schedule's job rather than one invocation's: each run takes the batch whose
 * readings are oldest (`sweepBatch`), and at a ten-minute interval forty
 * agents a run covers more of the roster per hour than the two-hourly full
 * sweep did — while being, unlike it, something that reliably completes.
 */
export const SWEEP_MAX_AGENTS = 40;

/**
 * The hard end of a run, whatever the batch has left.
 *
 * `SWEEP_MAX_AGENTS` bounds how many agents a run attempts; this bounds how
 * long it may spend doing so, because an agent's cost is not ours to predict.
 * Outbound calls each carry their own timeout (src/lib/net/bounded.ts), but
 * forty agents' worth of timeouts still add up, and an endpoint that answers
 * slowly without failing is exactly what went wrong. No new agent is started
 * past the deadline; the ones already in flight are bounded by their own
 * timeouts, so a sweep ends within roughly this budget plus one agent.
 *
 * End to end, including the roster: the clock starts on entry. A slow listing
 * therefore costs this run agents rather than costing it time, which is the
 * right way round — the next run is ten minutes away and will pick up
 * whatever this one did not reach.
 *
 * The route gives the whole request a budget of its own, which this one is a
 * share of (`SWEEP_RUN_BUDGET_MS`), and passes a signal that fires when it is
 * spent.
 */
export const SWEEP_BUDGET_MS = 90_000;

/** No successful sweep for this long is an outage of the evidence layer. */
export const STALE_ALERT_MS = 6 * 60 * 60 * 1000;

const age = (iso: string | null, now: number) => (iso ? now - Date.parse(iso) : Number.POSITIVE_INFINITY);

/**
 * Whether a sweep is due, given when the last one *started*.
 *
 * The parameter is a run's start, not its finish, and the distinction is the
 * whole cadence. Fed a finish, this under-paces by however long the run took:
 * the scheduler checks on a fixed tick, so the age of the last finish is
 * always the tick interval minus the run, always just short of due, and the
 * sweep slips to the following tick. In production that turned a ten-minute
 * schedule into an eighteen-minute one.
 *
 * `staleAlertDue` is the one that wants a finish, because an outage of the
 * evidence layer is about sweeps not completing.
 */
export function sweepDue(lastStartedAt: string | null, now: number): boolean {
  return age(lastStartedAt, now) >= SWEEP_INTERVAL_MS;
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
 * over three runs. Keyed to `SWEEP_TICK_MS`, because a run happens on a tick:
 * it was keyed to `SWEEP_INTERVAL_MS`, which was the same number until that
 * became a floor sitting below the cadence, at which point the page would
 * have advanced faster than runs occurred and skipped part of the registry
 * on every lap. Nothing is lost by not re-reading a page: the registry
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
  return (Math.floor(now / SWEEP_TICK_MS) % pages) * pageSize;
}
