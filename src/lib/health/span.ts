/**
 * Where a slow request spent its time, separated into CPU and waiting.
 *
 * On 20 October the site stopped serving and three successive explanations
 * were wrong: sweep frequency, then an N+1 query over probe history, then a
 * CPU figure derived by subtracting one endpoint's median latency from
 * another's. The first two were disproved by measurement — the probe path
 * turned out to be about 16ms of a request — and the third was never a
 * measurement at all.
 *
 * The thing none of them established is the one that decides what to fix:
 * whether the time goes on the CPU or on waiting for something else. Those
 * have opposite remedies, and a dedicated core hides the difference by
 * absorbing both.
 *
 * So a span records elapsed wall time and the CPU time charged to this
 * process across the same interval. `waitMs` is the remainder: time the span
 * was open and not computing, which is upstream calls, disk, or waiting for
 * the loop. It is a residual rather than a direct reading of any one of
 * those, and under concurrent load the CPU figure includes work done for
 * other requests — so these numbers localise a cost, they do not apportion
 * one.
 *
 * Cost of measuring: two `hrtime` reads and two `cpuUsage` reads, all
 * sub-microsecond, and a log line only when a span runs long. Nothing is
 * recorded about what was requested — no paths, ids, wallets or payloads —
 * because this is here to time code, not to watch people.
 */

/** Below this, a span is not worth a line in the log. */
const REPORT_OVER_MS = 250;

export interface SpanTiming {
  label: string;
  elapsedMs: number;
  cpuMs: number;
  waitMs: number;
}

/**
 * Time an async span and log it when it runs long.
 *
 * The label is a fixed string from the call site, never derived from input,
 * so no request content can reach the log through it.
 */
export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = process.hrtime.bigint();
  const cpuBefore = process.cpuUsage();
  try {
    return await fn();
  } finally {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const cpu = process.cpuUsage(cpuBefore);
    const cpuMs = (cpu.user + cpu.system) / 1000;
    if (elapsedMs >= REPORT_OVER_MS) {
      // `wait` floors at zero: on a busy loop the CPU charged across the
      // interval can exceed the interval itself, which is real but makes a
      // negative remainder, and a negative wait reads as a bug rather than
      // as contention.
      const waitMs = Math.max(0, elapsedMs - cpuMs);
      console.info(
        `[timing] ${label} elapsed=${elapsedMs.toFixed(0)}ms cpu=${cpuMs.toFixed(0)}ms wait=${waitMs.toFixed(0)}ms`,
      );
    }
  }
}

/**
 * The same, for a synchronous span.
 *
 * The loop this is wrapped around is synchronous and blocks the event loop
 * while it runs, so `wait` should be near zero and elapsed should be close
 * to cpu. If it is not, the loop is yielding somewhere it was not expected
 * to, which is worth knowing on its own.
 */
export function timedSync<T>(label: string, fn: () => T): T {
  const startedAt = process.hrtime.bigint();
  const cpuBefore = process.cpuUsage();
  try {
    return fn();
  } finally {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const cpu = process.cpuUsage(cpuBefore);
    const cpuMs = (cpu.user + cpu.system) / 1000;
    if (elapsedMs >= REPORT_OVER_MS) {
      console.info(
        `[timing] ${label} elapsed=${elapsedMs.toFixed(0)}ms cpu=${cpuMs.toFixed(0)}ms wait=${Math.max(0, elapsedMs - cpuMs).toFixed(0)}ms`,
      );
    }
  }
}
