import 'server-only';

import { sendOperatorAlert } from '@/lib/alerts/operator';
import { getProbeStore } from '@/lib/history/store';
import { staleAlertDue, sweepDue } from '@/lib/history/schedule';

const TICK_MS = 10 * 60 * 1000;
/** A sweep takes a few minutes; the route's own budget is longer. */
const SWEEP_TIMEOUT_MS = 15 * 60 * 1000;

let started = false;
let inFlight = false;
let alertedAt: string | null = null;

/**
 * The server's own sweep schedule.
 *
 * The machine never sleeps (fly.toml: auto_stop off, one always running),
 * so a timer here fires on time where GitHub's cron did not. Every ten
 * minutes it checks the last recorded sweep and, when two hours have
 * passed, calls the sweep route on this machine with its secret, so the
 * sweep and everything that rides on it (notifications, reconciliation,
 * checks) stays in one place. The route refuses to overlap or repeat a
 * recent sweep, so this and the GitHub backup cannot double up.
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
          'The server retries every two hours on its own schedule; check the Fly logs for [sweep-scheduler] lines.',
      }).catch(() => undefined);
    }

    if (!sweepDue(last, now)) return;
    inFlight = true;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/sweep`, {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.SWEEP_SECRET}` },
        signal: AbortSignal.timeout(SWEEP_TIMEOUT_MS),
      });
      const body = (await response.json().catch(() => ({}))) as { probes?: number; skipped?: string; error?: string };
      console.log(`[sweep-scheduler] ${response.status} ${body.skipped ? `skipped (${body.skipped})` : body.error ?? `${body.probes ?? 0} probes`}`);
    } catch (error) {
      console.warn(`[sweep-scheduler] sweep request failed: ${(error as Error).message}`);
    } finally {
      inFlight = false;
    }
  };

  // First check a minute after boot, once the server is taking requests.
  setTimeout(() => void tick(), 60_000).unref();
  setInterval(() => void tick(), TICK_MS).unref();
  console.log('[sweep-scheduler] on: checks every 10 minutes, sweeps every 2 hours');
}
