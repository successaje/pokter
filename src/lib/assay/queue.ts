/**
 * Which agents a sweep checks next.
 *
 * Never-checked agents first, then the longest since their last result. An
 * attempt that failed (an endpoint that did not answer, a card that would
 * not load, a network error on either side) records no result, so it used to
 * leave the agent at the front of the queue: the same two agents failed every
 * sweep from 12 October and nobody behind them was ever checked. A failed
 * attempt now waits `retryMs` and counts as the agent's turn for ordering.
 */
export function dueForCheck<T extends { chainId: number; tokenId: string }>(
  agents: T[],
  history: { lastRun: Map<string, string>; lastAttempt: Map<string, string> },
  { now, recheckMs, retryMs, limit }: { now: number; recheckMs: number; retryMs: number; limit: number },
): T[] {
  const age = (at: string | undefined) => (at ? now - Date.parse(at) : Number.POSITIVE_INFINITY);
  return agents
    .map((agent) => {
      const key = `${agent.chainId}:${agent.tokenId}`;
      const run = history.lastRun.get(key);
      const attempt = history.lastAttempt.get(key);
      return { agent, run, attempt, turn: Math.min(age(run), age(attempt)) };
    })
    .filter(({ run, attempt }) => age(run) >= recheckMs && age(attempt) >= retryMs)
    // Never checked and never tried first; then whoever has waited longest.
    .sort((a, b) => b.turn - a.turn)
    .slice(0, limit)
    .map(({ agent }) => agent);
}
