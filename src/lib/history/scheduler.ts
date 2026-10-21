import 'server-only';

import { Agent } from 'undici';

import { sendOperatorAlert } from '@/lib/alerts/operator';
import { getProbeStore, type SweepRecord } from '@/lib/history/store';
import {
  SWEEP_FIRST_TICK_MS,
  SWEEP_INTERVAL_MS,
  SWEEP_TICK_MS,
  staleAlertDue,
  sweepDue,
} from '@/lib/history/schedule';

/**
 * How long to wait for the route, now that a sweep is bounded.
 *
 * This was fifteen minutes, longer than the tick interval, which meant a
 * request that hung was still open when the next tick came round — the
 * scheduler's own `inFlight` guard was all that stopped them stacking up.
 * Six minutes sits above the route's declared `maxDuration` of 300s, so a
 * run that is legitimately finishing is not cut off, and below the tick, so
 * a run that is not finishing is abandoned before another is considered.
 *
 * Giving up here now also stops the work: the route passes its request
 * signal into `runSweep`, so an abandoned sweep starts no further agents.
 */
const SWEEP_TIMEOUT_MS = 6 * 60 * 1000;

/*
 * The route answers only when the sweep and everything after it is done,
 * which took just over five minutes on 15 October. Node's fetch gives up
 * on a response whose headers take more than 300 seconds, so the first
 * scheduled sweep finished and was recorded while the scheduler logged
 * "fetch failed". Its own dispatcher waits as long as the abort signal.
 */
const patient = new Agent({ headersTimeout: SWEEP_TIMEOUT_MS, bodyTimeout: SWEEP_TIMEOUT_MS });

let started = false;
let inFlight = false;
let alertedAt: string | null = null;
/**
 * When this scheduler last started a run, which is what paces it.
 *
 * It used to pace from the last sweep the store had recorded finishing, and
 * that quietly halved the cadence. A run takes a couple of minutes, so at the
 * next tick the age of the last *finish* is the tick interval minus the run —
 * never quite the interval itself, so never due, so the sweep landed on the
 * tick after. Measured in production: runs at 12:40 and 12:58, eighteen
 * minutes apart on a ten-minute schedule.
 *
 * The store could not fix it either. Its most recent record is the testnet
 * pass, which starts near the end of the run, so even that `startedAt` is
 * short of a full interval by the time the next tick comes round.
 *
 * A cadence is about when work starts, and when this scheduler starts work is
 * something it knows without asking anything. The store is still read, for
 * whether sweeps have stopped altogether (`staleAlertDue`), which is rightly
 * about completion rather than cadence.
 *
 * A restart empties it, so the first tick of a new process seeds it from the
 * store — see the tick itself. Without that seed the scheduler asked for a
 * sweep after every deploy however recently one had run, and the route
 * refused; with it, a process that has genuinely been away sweeps at once
 * and one that has just redeployed waits out the floor.
 */
let lastRunStartedAt: string | null = null;

/**
 * The server's own sweep schedule.
 *
 * The machine never sleeps (fly.toml: auto_stop off, one always running),
 * so a timer here fires on time where GitHub's cron did not. Every ten
 * minutes it checks the last recorded sweep and, when one is due
 * (`SWEEP_INTERVAL_MS`), calls the sweep route on this machine with its
 * secret, so the sweep and everything that rides on it (notifications,
 * reconciliation, checks) stays in one place. The route refuses to overlap
 * or repeat a recent sweep, so this and the GitHub backup cannot double up.
 *
 * Each sweep measures a batch of the roster under a wall-clock budget rather
 * than all of it, which is why the interval can be this short — see
 * `SWEEP_MAX_AGENTS`.
 *
 * Off unless SWEEP_SCHEDULER is "on", which only fly.toml sets: a local
 * dev server must never sweep production agents on its own.
 */
export function startSweepScheduler(): void {
  if (started) return;
  if (process.env.SWEEP_SCHEDULER !== 'on' || !process.env.SWEEP_SECRET) {
    /*
     * Off is said, loudly and once per boot. It was silent: switched off by
     * a Fly secret during the 20 October outage, it stayed off for about
     * twenty hours, and the stale-sweep alert below could not fire because
     * it runs inside this scheduler. Probes, notifications, reminders and
     * liquidation alerts all stop with it.
     */
    started = true;
    const why = process.env.SWEEP_SCHEDULER !== 'on' ? `SWEEP_SCHEDULER is ${process.env.SWEEP_SCHEDULER ? `"${process.env.SWEEP_SCHEDULER}"` : 'unset'}` : 'SWEEP_SECRET is not set';
    console.error(`[sweep-scheduler] off: ${why}. Nothing sweeps on this machine's clock.`);
    if (process.env.NODE_ENV === 'production') {
      void sendOperatorAlert({
        subject: 'Pokter: the sweep scheduler is off',
        body:
          `This machine booted with the sweep scheduler off (${why}). Probes, job notifications, reconciliation, Set and Earn reminders and liquidation alerts do not run until it is on.\n\n` +
          'fly.toml sets SWEEP_SCHEDULER = on; a Fly secret of the same name overrides it. If one is set, `fly secrets unset SWEEP_SCHEDULER` restores the file\'s value.',
      }).catch(() => undefined);
    }
    return;
  }
  started = true;
  const port = process.env.PORT ?? '8080';

  const tick = async () => {
    if (inFlight) return;
    const now = Date.now();
    let recorded: SweepRecord | null = null;
    try {
      recorded = getProbeStore().lastSweep();
    } catch (error) {
      console.warn(`[sweep-scheduler] could not read the last sweep: ${(error as Error).message}`);
      return;
    }
    const last = recorded?.finishedAt ?? null;

    /*
     * A process that has just booted remembers nothing, and the store does.
     *
     * Pacing lives in memory because a cadence is this scheduler's own
     * business, but memory does not survive a deploy — and the store does.
     * Left unseeded, the first tick after every restart asked for a sweep
     * however recently one had run, and the route refused it: production
     * redeployed at 14:42 with a sweep recorded at 14:40:28, so the tick at
     * 14:43 was inside the route's stand-down window and nothing happened
     * until the tick after. The route was right and the scheduler was wrong.
     *
     * The store's most recent record is the testnet pass, which starts near
     * the end of a run, so this seed reads as slightly more recent than the
     * run really was. That is the safe direction for a seed: it can only
     * make a freshly booted process wait a little longer, never sweep twice
     * over endpoints that were just called. It is a lower bound at boot, not
     * the per-tick clock — which is the thing it must not become, since a
     * run's own records finish a run-length after it began.
     */
    lastRunStartedAt ??= recorded?.startedAt ?? null;

    if (staleAlertDue(last, alertedAt, now)) {
      alertedAt = new Date(now).toISOString();
      void sendOperatorAlert({
        subject: 'Pokter: no successful sweep in six hours',
        body:
          `The last recorded sweep finished at ${last ?? 'never'}. Availability figures stop updating while sweeps fail.\n\n` +
          'The server retries every ten minutes on its own schedule; check the Fly logs for [sweep-scheduler] lines.',
      }).catch(() => undefined);
    }

    if (!sweepDue(lastRunStartedAt, now)) return;
    inFlight = true;
    // Before the run, not after it: the next tick has to see that this one
    // happened even while it is still going.
    lastRunStartedAt = new Date(now).toISOString();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/sweep`, {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.SWEEP_SECRET}` },
        signal: AbortSignal.timeout(SWEEP_TIMEOUT_MS),
        dispatcher: patient,
      } as RequestInit);
      const body = (await response.json().catch(() => ({}))) as {
        probes?: number; answered?: number; agents?: number; rosterSize?: number;
        cutShort?: boolean; standDown?: string; error?: string;
      };
      // Coverage per run matters now that a run is a batch: `agents of
      // rosterSize` is how to see the roster being worked through, and
      // `cut short` is how to see the budget being hit every time.
      const measured = `${body.agents ?? 0}/${body.rosterSize ?? 0} agents, ${body.probes ?? 0} probes, ${body.answered ?? 0} answered${body.cutShort ? ', cut short' : ''}`;
      console.log(`[sweep-scheduler] ${response.status} ${body.standDown ? `stood down (${body.standDown})` : body.error ?? measured}`);
    } catch (error) {
      console.warn(`[sweep-scheduler] sweep request failed: ${(error as Error).message}`);
    } finally {
      inFlight = false;
    }
  };

  /*
   * First check a minute after boot, once the server is taking requests.
   *
   * `setInterval` is anchored here, not to that first timer, so the gap
   * between tick one and tick two is a minute short of the rest. That gap is
   * the tightest in the schedule and `SWEEP_INTERVAL_MS` has to clear it,
   * which is asserted in the schedule's tests rather than left to arithmetic
   * done once in a comment.
   */
  setTimeout(() => void tick(), SWEEP_FIRST_TICK_MS).unref();
  setInterval(() => void tick(), SWEEP_TICK_MS).unref();
  console.log(
    `[sweep-scheduler] on: sweeps every ${SWEEP_TICK_MS / 60_000} minutes, and never twice inside ${SWEEP_INTERVAL_MS / 60_000}`,
  );
}
