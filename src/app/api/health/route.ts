import { NextResponse } from 'next/server';
import { accessSync, constants } from 'node:fs';
import { dirname } from 'node:path';

import { readVitals } from '@/lib/health/vitals';
import { STORES, isDurable, storePath } from '@/lib/health/stores';

export const dynamic = 'force-dynamic';

/**
 * What this check is for, and what it deliberately does not do.
 *
 * It answers one question the platform can act on — can this machine serve at
 * all — and reports several it cannot. The acting-on matters: there is one
 * machine, so a 503 here takes the site off the proxy entirely. Something
 * that makes the site slow is therefore not a reason to return one; something
 * that makes it impossible is.
 *
 * So the disks still gate. A process that cannot write its stores cannot do
 * the job, and being pulled from the pool is the correct outcome.
 *
 * Saturation does not gate, and the reason is worth stating because the
 * instinct runs the other way. On 19 October this check said `ok` for eight
 * hours while nothing was served, and the obvious fix is to make it fail when
 * the process is struggling. But with one machine that converts a site which
 * is slow into a site which is gone, and if the detector is ever wrong it
 * does so permanently. Saturation is reported in the body and logged, where
 * an operator and the logs can both see it, and the decision to give it teeth
 * is a deployment decision rather than one buried here.
 *
 * Nothing in here does I/O beyond the `accessSync` calls, and nothing reads
 * the probe store. That is the independence the check has to keep: a check
 * that waits on a lock a sweep is holding is a check that gets the machine
 * recycled mid-sweep, so no sweep ever finishes.
 */


export function GET(): NextResponse {
  /*
   * Every store, from the one list there is.
   *
   * This used to be eight entries written out here, of sixteen that existed,
   * so half of them were unchecked and nothing said which half. See
   * `lib/health/stores` for why the list moved and what now holds it to the
   * code.
   */
  const storage = Object.fromEntries(STORES.map((store) => {
    const path = storePath(store);
    const persistent = isDurable(path);
    try {
      accessSync(dirname(path), constants.R_OK | constants.W_OK);
      return [store.name, { ok: true, persistent }];
    } catch {
      return [store.name, { ok: false, persistent }];
    }
  }));
  const writable = Object.values(storage).every((store) => store.ok);
  const persistent = process.env.NODE_ENV !== 'production' || Object.values(storage).every((store) => store.persistent);
  const healthy = writable && persistent;

  const vitals = readVitals();
  if (vitals.saturated) {
    // Loud, because the body is only read by whoever thought to look. These
    // are the lines that would have shortened 19 October from hours to minutes.
    // "saturated", not "degraded": `degraded` is this file's word for the
    // storage faults that gate, and the log must use the same vocabulary as
    // the body or the two read as different problems.
    console.error(`[health] serving is saturated: ${vitals.reasons.join('; ')}`);
  }

  return NextResponse.json(
    {
      // `ok` means this machine can serve. `saturated` means it is serving
      // badly, which is not the same as `degraded` — that is reserved for the
      // storage faults below, the ones that gate.
      status: healthy ? (vitals.saturated ? 'saturated' : 'ok') : 'degraded',
      storage: { writable, persistent, stores: storage },
      /*
       * Serving, as distinct from answering this check.
       *
       * `outbound` counts only calls made through `boundedFetch`, so it is a
       * sample of the process's outbound load and not a census: the chain
       * clients and the escrow SDK build their own. `lastSweepFinishedAt` is
       * what this process has seen since it booted, so a fresh one reports
       * null — it is here to be read, never to decide anything.
       */
      serving: {
        saturated: vitals.saturated,
        reasons: vitals.reasons,
        loopLagMs: vitals.loopLagMs,
        sinceLastCheckMs: vitals.sinceLastCheckMs,
        outbound: vitals.outbound,
      },
      /*
       * Both ends of the last run, because only the pair says anything about
       * cadence. Successive starts are the schedule; successive finishes are
       * the schedule plus however much the runs differed in length, which is
       * what made this unmeasurable the first two times it was wrong.
       */
      sweep: {
        lastStartedAt: vitals.lastRunStartedAt,
        lastFinishedAt: vitals.lastSweepFinishedAt,
        gates: false,
      },
    },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
