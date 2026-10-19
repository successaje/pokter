/**
 * Budgets for anything that leaves this process.
 *
 * On 19 October the site stopped serving for about eight hours. The box is
 * one shared CPU, and the cause was not a crash: outbound calls had no
 * end-to-end budget, so a slow upstream turned into stuck work that piled
 * up faster than it drained. `[warmup] registry cache primed in 187.4s` is
 * what that looked like from the inside, and
 * `testnet-relay.altana.network: The request took too long to respond` is
 * what it looked like from outside.
 *
 * Two rules, and both are needed. A timeout bounds how long one call can
 * cost; a concurrency cap bounds how many can be in flight at once,
 * because a hundred calls that each honour their budget still arrive
 * together. `Promise.all` over a list read from a database is the shape to
 * watch for: the list grows with the product and the fan-out grows with
 * it, silently, until the day it does not fit.
 *
 * Only the timeouts live here. The cap already existed as
 * `lib/concurrency.ts`'s `mapWithConcurrency`, and a second one would be
 * the drift this module exists to prevent — callers that must tolerate a
 * failure catch inside the task, which is the idiom `marketplace.ts`
 * already uses.
 */

import { outboundStarted } from '@/lib/health/vitals';

/** Long enough for a slow-but-working upstream, short enough to shed load. */
export const DEFAULT_TIMEOUT_MS = 8_000;

export class TimedOut extends Error {
  constructor(label: string, ms: number) {
    super(`${label} did not answer within ${ms}ms`);
    this.name = 'TimedOut';
  }
}

/**
 * A hard ceiling on a promise that has no timeout of its own.
 *
 * For work this process cannot pass an `AbortSignal` to — an SDK call that
 * builds its own client, for instance. The underlying request is not
 * cancelled, so this bounds the *waiting*, not the work; where a signal can
 * be passed, pass one instead and cancel the request itself.
 */
export function withTimeout<T>(work: Promise<T>, label: string, ms = DEFAULT_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimedOut(label, ms)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error as Error);
      },
    );
  });
}

/**
 * A call's own deadline, and the caller's cancellation, as one signal.
 *
 * Every outbound call needs a ceiling of its own; a call made on someone's
 * behalf also needs to stop when they stop waiting. Those are two different
 * reasons to abort and both have to stay live, which is what `AbortSignal.any`
 * is for — a call that took only the caller's signal would lose its ceiling,
 * and one that took only its own would keep running after the work was
 * cancelled.
 *
 * Written out once because it was being written out everywhere: the fetch
 * below, both of the prober's, and the quote's. Four copies of a two-reason
 * abort is three chances to drop one of the reasons.
 */
export function deadlineSignal(timeoutMs: number, signal?: AbortSignal | null): AbortSignal {
  const deadline = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

/**
 * `fetch` that always has a deadline, including one it did not ask for.
 *
 * Also the one place the process can count its own outbound load, which is
 * why the call is registered with `outboundStarted`. `/api/health` reports
 * those counts: on 19 October the check answered `ok` throughout, because
 * nothing it looked at could tell it that every page was stuck waiting on
 * calls exactly like these.
 */
export function boundedFetch(input: string | URL, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = init;
  // A caller's own signal still wins; this only adds a ceiling where there was none.
  const settled = outboundStarted();
  return fetch(input, { ...rest, signal: deadlineSignal(timeoutMs, signal) }).then(
    (response) => {
      settled();
      return response;
    },
    (error: unknown) => {
      /* A deadline reached is the interesting kind of failure, and the only
         one the health report counts separately: it is what piling up looks
         like one call at a time. An abort by the caller is not — that is the
         process shedding work on purpose. */
      const name = (error as Error)?.name;
      settled(name === 'TimeoutError');
      throw error as Error;
    },
  );
}
