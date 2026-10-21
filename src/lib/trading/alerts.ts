/**
 * Which of a wallet's flows a subscriber is told about. Pure.
 *
 * Only what Pokter found after the person subscribed (a new subscriber is
 * not sent the wallet's history), only once (`alertedThrough` is the last
 * block already covered), and only the transactions where tokens left and
 * nothing came back. `nextThrough` is what to record once the email is sent.
 */
export function alertableFlows<T extends { block: number; at: string; verdict: string }>(
  flows: readonly T[],
  state: { alertedThrough: number | null; subscribedAt: string },
): { alert: T[]; nextThrough: number | null } {
  const fresh = flows.filter((f) => (state.alertedThrough === null ? f.at >= state.subscribedAt : f.block > state.alertedThrough));
  return {
    alert: fresh.filter((f) => f.verdict === 'not-returned'),
    nextThrough: fresh.length ? Math.max(...fresh.map((f) => f.block)) : state.alertedThrough,
  };
}
