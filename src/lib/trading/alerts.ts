/**
 * Which of a wallet's flows a subscriber is told about. Pure.
 *
 * Only what Pokter found after the person subscribed (a new subscriber is
 * not sent the wallet's history), only once (`alertedThrough` is the last
 * block already covered), and only the transactions where tokens left and
 * nothing came back. `nextThrough` is what to record once the email is sent.
 *
 * The bookmark moves past every flow the window held, not only past the ones
 * worth an email. `flowsAfter` reads fifty rows at a time, oldest first, so a
 * wallet that was watched for a while before anybody subscribed fills that
 * whole window with flows older than the subscription. Moving the bookmark
 * only for alertable flows left it null in that case, the next sweep read the
 * same fifty rows, and the subscriber was never told about anything — the
 * silence this file exists to break. Both conditions are therefore applied
 * separately: the bookmark says what has been looked at, and the subscription
 * time says what may be sent.
 */
export function alertableFlows<T extends { block: number; at: string; verdict: string }>(
  flows: readonly T[],
  state: { alertedThrough: number | null; subscribedAt: string },
): { alert: T[]; nextThrough: number | null } {
  const alertedThrough = state.alertedThrough;
  const looked = alertedThrough === null ? [...flows] : flows.filter((f) => f.block > alertedThrough);
  return {
    alert: looked.filter((f) => f.at >= state.subscribedAt && f.verdict === 'not-returned'),
    nextThrough: looked.length ? Math.max(...looked.map((f) => f.block)) : alertedThrough,
  };
}

/** Long enough that one failed sweep (they run about every ten minutes) is not an email. */
export const COVERAGE_GRACE_MS = 20 * 60_000;

/**
 * Whether a subscriber should hear that their wallet is not being checked.
 *
 * An alert that fires on a bad transaction says nothing when the checks
 * stop, and silence then reads as "all fine". So a wallet whose checks
 * have failed, stalled or fallen behind for longer than the grace period
 * gets one email saying so, and one more when checking resumes. The
 * coverage state is `coverage.ts`'s; only `current` counts as checked.
 */
export function coverageNotice(input: { state: string; now: number; badSince: string | null; warnedAt: string | null }): { badSince: string | null; warnedAt: string | null; send: 'not-checked' | 'checking-again' | null } {
  const checked = input.state === 'current';
  if (checked) return { badSince: null, warnedAt: null, send: input.warnedAt ? 'checking-again' : null };
  const badSince = input.badSince ?? new Date(input.now).toISOString();
  if (input.warnedAt) return { badSince, warnedAt: input.warnedAt, send: null };
  if (input.now - Date.parse(badSince) < COVERAGE_GRACE_MS) return { badSince, warnedAt: null, send: null };
  return { badSince, warnedAt: new Date(input.now).toISOString(), send: 'not-checked' };
}
