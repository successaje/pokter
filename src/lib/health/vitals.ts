/**
 * What the process can say about itself without doing any work.
 *
 * On 19 October `/api/health` returned `ok` for eight hours while pokter.xyz
 * served nothing. It was not lying and it was not broken: it checks that the
 * database directories are writable, which they were. It makes no outbound
 * call and reads no store, so it answered in microseconds while every real
 * page sat waiting on an upstream that never replied, and the piled-up
 * renders filled the proxy's concurrency limit. Health checks reach the port
 * directly and are not subject to that limit, so the one request that still
 * worked was the only one being asked.
 *
 * The lesson is not that the check should depend on more. A check that calls
 * an upstream fails when the upstream does, and a check that reads the
 * sweep's progress fails while a sweep holds the write lock — then the
 * platform recycles the machine mid-sweep and no sweep ever finishes.
 * Independence is the right property and it is kept.
 *
 * What was missing is the ability to tell *answering a health check* from
 * *serving the site*. Those were the same thing for as long as nothing could
 * get stuck, and stopped being the same thing on 19 October. So the process
 * keeps a few cheap numbers about its own condition, all read from memory,
 * and the check reports them. None of it does I/O, so none of it can be made
 * to fail by a sweep.
 */

import { monitorEventLoopDelay } from 'node:perf_hooks';

/** Rolling window for the outbound timeout count. */
const TIMEOUT_WINDOW_MS = 5 * 60_000;

/**
 * How late a health check has to arrive before the process is behind.
 *
 * Fly asks every 30s, so arriving late means this process took its time over
 * a handler that does almost nothing — which no amount of waiting on an
 * upstream explains, only contention for the one shared CPU does.
 *
 * Three intervals, not one and a half. At 45s a single check the platform
 * skipped or lost would land at 60s and be reported as this process
 * struggling, which is a claim about the wrong thing: Fly missing a check is
 * not Pokter being slow. A gap of a minute and a half cannot be one missed
 * check, and a false alarm in the one place an operator looks during an
 * incident is expensive — it is how a real signal stops being believed.
 */
const LATE_CHECK_MS = 90_000;

/**
 * Event-loop lag that means the process is no longer keeping up.
 *
 * Waiting on a slow upstream costs no lag at all; the loop is idle while a
 * socket is open. Lag appears when there is real work queued and nowhere to
 * run it — dozens of concurrent renders parsing JSON, rendering React and
 * making synchronous SQLite reads on a single shared core. A second of it is
 * not a slow page, it is a process that cannot answer anything promptly,
 * which is the state the site was in.
 *
 * Measured, not guessed: an idle server reports a mean of about 21ms, which
 * is the 20ms sampling resolution's own floor rather than real delay. The
 * threshold is some fifty times that, so normal operation cannot reach it.
 */
const SATURATED_LAG_MS = 1_000;

/**
 * An outbound call open longer than any deadline this process configures.
 *
 * Not a tuned threshold but a broken invariant. Since every call goes out
 * through `boundedFetch` with a ceiling of at most a few seconds, none can
 * legitimately still be open after a minute. One that is means a call
 * escaped its deadline — which is precisely the condition that took the site
 * down, when 8004scan queries had no timeout at all and sat open for 187
 * seconds while every page waited behind them.
 *
 * It should be unreachable. It is checked because the cost of being wrong
 * about that was eight hours.
 */
const ESCAPED_DEADLINE_MS = 60_000;

/**
 * Deadlines reached in the window before the upstream counts as unavailable.
 *
 * Only calls this product makes on its own behalf go through `boundedFetch` —
 * in practice the registry API — so this is not agents failing their probes,
 * which is normal and is the thing Pokter exists to measure. It is Pokter's
 * own source of truth not answering, and at this rate every page is rendering
 * with fewer results than it should.
 *
 * Reported for a reason found by running it, and the distinction is worth
 * keeping straight. A burst of concurrent cold renders against a local server
 * produced 26 of these in five minutes — and it also drove event-loop lag to
 * seconds, because rendering thirty pages at once is CPU-bound. 19 October was
 * not: those pages were waiting on a socket, which costs no CPU and so
 * produces no lag, which is exactly why the check went on saying `ok`. Lag
 * catches a process out of CPU; this catches a process waiting on something
 * that is never going to answer, and only the second describes the outage.
 *
 * So it belongs in the verdict rather than merely in the output. Printing a
 * number and letting nothing depend on it is what the original check did.
 *
 * The wording names the upstream, because this is not a fault of this machine
 * and the report must not imply it is.
 */
const UPSTREAM_UNAVAILABLE = 20;

export interface OutboundVitals {
  /** Calls open right now. */
  inFlight: number;
  /** How long the longest-open call has been open. */
  oldestOpenMs: number | null;
  /** Calls that hit their own deadline in the last five minutes. */
  timedOutRecently: number;
}

export interface Vitals {
  outbound: OutboundVitals;
  /** Event-loop delay since the previous read, or null where unavailable. */
  loopLagMs: { mean: number; p99: number } | null;
  /** How long since the previous health check, which should be the interval. */
  sinceLastCheckMs: number | null;
  /**
   * When a sweep run last began, as this process saw it.
   *
   * Reported because the finish below cannot answer the question anyone asks
   * of it. A cadence is the spacing of starts, and runs vary in length, so
   * successive finishes are the spacing plus a difference in duration —
   * which is the precise confusion that made the scheduler pace itself
   * wrongly twice. Instrumentation built to check a cadence that reported
   * only finishes could not check it, and did not, for two releases.
   */
  lastRunStartedAt: string | null;
  /**
   * When a sweep last finished, as this process saw it.
   *
   * From memory, never from the probe store. Reading the store here would
   * make the health check wait on whatever lock a sweep is holding, which is
   * the one coupling that must not exist: a check a running sweep can fail is
   * a check that gets the machine recycled mid-sweep.
   *
   * The cost of memory is that a fresh process reports null rather than what
   * the store knows. That is the right trade — it is reported, never gated,
   * so being unknown is never mistaken for being unhealthy.
   */
  lastSweepFinishedAt: string | null;
  /**
   * The process is not keeping up: serving is affected whatever else answers.
   *
   * Reported, not fatal. See the health route for why this does not 503.
   */
  saturated: boolean;
  /** Which signals fired, so a report says why rather than only that. */
  reasons: string[];
}

interface LagHistogram {
  /** Samples taken since the last reset. Zero makes the rest meaningless. */
  count: number;
  mean: number;
  percentile(p: number): number;
  reset(): void;
  enable(): boolean;
  disable(): boolean;
}

/**
 * Started on first read rather than at import, and held once per process.
 *
 * The histogram samples the loop continuously once enabled, so starting it
 * lazily means nothing pays for it until something asks — and a build or a
 * test that imports this module for the counters alone never turns it on.
 * On `globalThis` for the same reason as the counters: several copies of this
 * module get loaded, and each one enabling its own sampler would be several
 * samplers measuring the same loop while the reader reset only its own.
 * Guarded because an environment without `perf_hooks` should lose one
 * reported number, not the whole health check.
 */
const LAG = Symbol.for('pokter.health.lag');

function lagHistogram(): LagHistogram | null {
  const host = globalThis as typeof globalThis & { [LAG]?: LagHistogram | false };
  if (host[LAG] !== undefined) return host[LAG] || null;
  try {
    const histogram = monitorEventLoopDelay({ resolution: 20 }) as unknown as LagHistogram;
    histogram.enable();
    host[LAG] = histogram;
    return histogram;
  } catch {
    host[LAG] = false;
    return null;
  }
}

/**
 * The state, kept on `globalThis` rather than in this module.
 *
 * Module-level variables are not shared between routes. The first version of
 * this file used them, and the counters read zero throughout a page render
 * that was demonstrably making outbound calls — the page and `/api/health`
 * were each given their own copy of this module, so one incremented a counter
 * the other could not see. A health report that always reads zero is worse
 * than no report, because zero is also what healthy looks like.
 *
 * One object behind a symbol fixes it however many copies of the module get
 * loaded, in dev and in a production build alike, and it is the same reason
 * the ecosystem puts database clients here.
 */
const STATE = Symbol.for('pokter.health.vitals');

interface VitalsState {
  inFlight: number;
  nextId: number;
  lastRunStartedAt: string | null;
  /** Insertion-ordered, so the first still-open entry is the oldest. */
  openedAt: Map<number, number>;
  timedOutAt: number[];
  lastCheckAt: number | null;
  lastSweepFinishedAt: string | null;
}

function state(): VitalsState {
  const host = globalThis as typeof globalThis & { [STATE]?: VitalsState };
  host[STATE] ??= {
    inFlight: 0,
    nextId: 1,
    lastRunStartedAt: null,
    openedAt: new Map(),
    timedOutAt: [],
    lastCheckAt: null,
    lastSweepFinishedAt: null,
  };
  return host[STATE];
}

/**
 * Register an outbound call, and return the function that closes it out.
 *
 * Called by `boundedFetch`, which is the one place every fetch this product
 * makes on its own behalf goes through. Not every outbound call is one of
 * those — the chain clients and the escrow SDK build their own — so this is a
 * sample of the process's outbound load rather than a census of it, and the
 * health report says so.
 */
export function outboundStarted(now = Date.now()): (timedOut?: boolean) => void {
  const s = state();
  const id = s.nextId++;
  s.openedAt.set(id, now);
  s.inFlight += 1;

  let closed = false;
  return (timedOut = false) => {
    // Idempotent: a settle path that runs twice must not take the count below zero.
    if (closed) return;
    closed = true;
    s.openedAt.delete(id);
    s.inFlight -= 1;
    if (timedOut) s.timedOutAt.push(Date.now());
  };
}

/** Recorded when a sweep run finishes, so health can report it from memory. */
export function noteSweepFinished(finishedAt: string): void {
  state().lastSweepFinishedAt = finishedAt;
}

/**
 * Recorded when a run begins, by the route rather than the scheduler.
 *
 * Every run goes through the route — the scheduler's and the backup cron's
 * alike — so recording it there counts all of them. Recording it in the
 * scheduler would have counted only its own, and reported a quiet gap
 * whenever the backup was the thing that swept.
 */
export function noteRunStarted(startedAt: string): void {
  state().lastRunStartedAt = startedAt;
}

export function readVitals(now = Date.now()): Vitals {
  const s = state();
  s.timedOutAt = s.timedOutAt.filter((at) => now - at < TIMEOUT_WINDOW_MS);

  const oldest = s.openedAt.values().next();
  const oldestOpenMs = oldest.done ? null : now - oldest.value;

  /*
   * Only a histogram with samples in it says anything.
   *
   * An empty one reports `mean` as NaN — which serialises to null, so the
   * health body showed `"mean": null` next to a `p99` of half a microsecond,
   * a floor artefact of the underlying histogram rather than a measurement.
   * Both read as real numbers to anyone scanning the output. That is worth
   * guarding for the usual reason: a health report whose figures cannot be
   * trusted is worse than one that admits it has none yet, and this one is
   * read precisely when something has gone wrong.
   *
   * Zero happens on the first read after boot and on any read taken straight
   * after another, since each read resets the window. At the platform's
   * thirty-second interval and a twenty-millisecond resolution there are
   * about fifteen hundred samples per read in normal operation.
   */
  const histogram = lagHistogram();
  const loopLagMs =
    histogram && histogram.count > 0
      ? { mean: histogram.mean / 1e6, p99: histogram.percentile(99) / 1e6 }
      : null;
  // A rolling window: the next read describes the next interval, not all time.
  if (histogram && histogram.count > 0) histogram.reset();

  const sinceLastCheckMs = s.lastCheckAt === null ? null : now - s.lastCheckAt;
  s.lastCheckAt = now;

  const reasons: string[] = [];
  if (loopLagMs && loopLagMs.p99 >= SATURATED_LAG_MS) {
    reasons.push(`event loop lagging ${Math.round(loopLagMs.p99)}ms at p99`);
  }
  if (sinceLastCheckMs !== null && sinceLastCheckMs >= LATE_CHECK_MS) {
    reasons.push(`health check arrived ${Math.round(sinceLastCheckMs / 1000)}s after the last`);
  }
  if (oldestOpenMs !== null && oldestOpenMs >= ESCAPED_DEADLINE_MS) {
    reasons.push(`an outbound call has been open ${Math.round(oldestOpenMs / 1000)}s, past every deadline`);
  }
  if (s.timedOutAt.length >= UPSTREAM_UNAVAILABLE) {
    reasons.push(`${s.timedOutAt.length} upstream calls hit their deadline in the last five minutes`);
  }

  return {
    outbound: { inFlight: s.inFlight, oldestOpenMs, timedOutRecently: s.timedOutAt.length },
    loopLagMs,
    sinceLastCheckMs,
    lastRunStartedAt: s.lastRunStartedAt,
    lastSweepFinishedAt: s.lastSweepFinishedAt,
    saturated: reasons.length > 0,
    reasons,
  };
}

/** Test seam: drop everything the process remembers. */
export function resetVitals(): void {
  const s = state();
  s.inFlight = 0;
  s.nextId = 1;
  s.openedAt.clear();
  s.timedOutAt = [];
  s.lastCheckAt = null;
  s.lastRunStartedAt = null;
  s.lastSweepFinishedAt = null;
}
