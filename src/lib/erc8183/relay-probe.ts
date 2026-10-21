import 'server-only';

import type { Category } from '@/lib/agents/categories';
import { staticSuiteFor } from '@/lib/assay/category-suites';
import { NotAskableError, PaidOnlyError, prepareAgent, sendPreparedBrief } from '@/lib/erc8183/courier';
import { getJobStore, type RelayProbeOutcome } from '@/lib/erc8183/store';
import { mapWithConcurrency } from '@/lib/concurrency';
import { GENERIC_RELAY_BRIEF, PROBE_RETRY_MS } from './relay-probe-policy';

const inFlight = new Set<string>();

/**
 * Send one brief to an agent the way Pokter's relay would, and record
 * whether it answered. Returns the outcome, or null when the test was not
 * run (tested recently, already running) or failed for Pokter's own reasons
 * (the registry or network), which are not held against the agent.
 */
export async function probeRelay(target: { chainId: number; tokenId: string; category: Category | 'unclassified' }, nowMs = Date.now()): Promise<RelayProbeOutcome | null> {
  const key = `${target.chainId}:${target.tokenId}`;
  const store = getJobStore();
  const last = store.relayProbe(target.chainId, target.tokenId);
  if (inFlight.has(key) || (last && nowMs - Date.parse(last.at) < PROBE_RETRY_MS)) return null;
  inFlight.add(key);
  const record = (outcome: RelayProbeOutcome, detail: string) => {
    store.recordRelayProbe({ chainId: target.chainId, tokenId: target.tokenId, outcome, detail });
    return outcome;
  };
  try {
    let agent;
    try {
      agent = await prepareAgent(target);
    } catch (error) {
      if (error instanceof NotAskableError) return record('not-askable', error.message);
      return null; // registry or card fetch failed: Pokter's problem, not the agent's
    }
    const brief = staticSuiteFor(target.category)?.scenarios[0]?.brief ?? GENERIC_RELAY_BRIEF;
    for (const dataOnly of [false, true]) {
      try {
        await sendPreparedBrief(agent, brief, { timeoutMs: 15_000, dataOnly });
        return record('answers', 'It answered a brief carried the way the relay carries one.');
      } catch (error) {
        if (error instanceof PaidOnlyError) return record('paid-only', error.message);
        if (dataOnly) return record('no-answer', (error as Error).message || 'No answer.');
        // Some agents accept exactly one structured part: ask once more that way.
      }
    }
    return null;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * The sweep's pass: test a few mainnet agents whose relay status is
 * unknown, so most are settled before anyone opens their hire page.
 * Four at a time, so the step takes about as long as one slow agent; each
 * agent is tested at most every few hours.
 */
export async function probeUnknownRelays(
  agents: ReadonlyArray<{ chainId: number; tokenId: string; category: Category | 'unclassified' }>,
  status: (chainId: number, tokenId: string) => Promise<{ status: 'ok' | 'refused' | 'unknown' }>,
  max = 4,
): Promise<{ tested: number; outcomes: Record<string, number> }> {
  const due: typeof agents[number][] = [];
  for (const agent of agents) {
    if (due.length >= max) break;
    if (agent.chainId === 97) continue; // registered on testnet: hired there directly, no relay
    if ((await status(agent.chainId, agent.tokenId).catch(() => null))?.status === 'unknown') due.push(agent);
  }
  const results = await mapWithConcurrency(due, 4, (agent) => probeRelay(agent).catch(() => null));
  const outcomes: Record<string, number> = {};
  for (const outcome of results) if (outcome) outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  return { tested: results.filter(Boolean).length, outcomes };
}
