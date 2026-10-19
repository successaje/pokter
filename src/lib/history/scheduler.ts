import 'server-only';

import { Agent } from 'undici';

import { sendOperatorAlert } from '@/lib/alerts/operator';
import { getProbeStore } from '@/lib/history/store';
import { SWEEP_INTERVAL_MS, staleAlertDue, sweepDue } from '@/lib/history/schedule';

const TICK_MS = 10 * 60 * 1000;
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
  if (started || process.env.SWEEP_SCHEDULER !== 'on' || !process.env.SWEEP_SECRET) return;
  started = true;
  const port = process.env.PORT ?? '8080';

  const tick = async () => {
    if (inFlight) return;
    const now = Date.now();
    let last: string | null = null;
    try {
      last = getProbeStore().lastSweep()?.finishedAt ?? null;
    } catch (error) {
      console.warn(`[sweep-scheduler] could not read the last sweep: ${(error as Error).message}`);
      return;
    }

    if (staleAlertDue(last, alertedAt, now)) {
      alertedAt = new Date(now).toISOString();
      void sendOperatorAlert({
        subject: 'Pokter: no successful sweep in six hours',
        body:
          `The last recorded sweep finished at ${last ?? 'never'}. Availability figures stop updating while sweeps fail.\n\n` +
          'The server retries every ten minutes on its own schedule; check the Fly logs for [sweep-scheduler] lines.',
      }).catch(() => undefined);
    }

    if (!sweepDue(last, now)) return;
    inFlight = true;
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

  // First check a minute after boot, once the server is taking requests.
  setTimeout(() => void tick(), 60_000).unref();
  setInterval(() => void tick(), TICK_MS).unref();
  console.log(
    `[sweep-scheduler] on: checks every ${TICK_MS / 60_000} minutes, sweeps at most every ${SWEEP_INTERVAL_MS / 60_000} minutes`,
  );
}
