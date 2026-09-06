import 'server-only';

import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { BSC_MAINNET } from '@/lib/scan/types';
import { listMarketplace } from '@/lib/marketplace';
import { probeAgent, probeTarget } from '@/lib/proof/prober';
import { mapWithConcurrency } from '@/lib/concurrency';
import { getProbeStore, type ProbeRecord, type SweepRecord } from './store';

export interface SweepOptions {
  chainId?: ChainId;
  /** Agents per category to pull into the roster. */
  perCategory?: number;
  /** Probes taken per agent per sweep. */
  samples?: number;
}

export interface SweepOutcome extends SweepRecord {
  /** Agents skipped because they publish nothing probeable. */
  skipped: number;
  /** Agents we could not look up at all — rate limits, outages, bad ids. */
  failed: number;
  /** Distinct lookup failures, so a silent sweep can be diagnosed. */
  errors: string[];
}

/**
 * Who gets measured.
 *
 * The roster is the union of what the marketplace currently lists and every
 * agent we already hold history for. The second half matters: an agent that
 * drops out of the listings must keep being measured, otherwise its record
 * silently freezes at whatever it looked like on the way out.
 */
async function buildRoster(
  chainId: ChainId,
  perCategory: number,
): Promise<{ chainId: number; tokenId: string }[]> {
  const store = getProbeStore();

  const sections = await listMarketplace({ chainId, limit: perCategory });
  const listed = sections.flatMap((section) =>
    section.listings.map((l) => ({
      chainId: l.agent.chain_id,
      tokenId: l.agent.token_id,
    })),
  );

  const seen = new Set<string>();
  return [...listed, ...store.trackedAgents()].filter((entry) => {
    const key = `${entry.chainId}:${entry.tokenId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Probe the whole roster once and persist the results.
 *
 * Run this on a schedule. A single page-load probe says whether an agent is up
 * right now; only a sweep repeated over days can say whether it has *stayed* up,
 * which is the claim the marketplace actually needs to make.
 */
/**
 * How many agents per category the sweep measures.
 *
 * Matched to what the category pages actually list. When this was six and the
 * pages showed twelve, half of every category was displayed but never
 * measured — including attested agents that were plainly live, which then read
 * as having no track record. An agent the product is willing to show is an
 * agent the product should be willing to check.
 */
export const SWEEP_PER_CATEGORY = 12;

export async function runSweep({
  chainId = BSC_MAINNET,
  perCategory = SWEEP_PER_CATEGORY,
  samples = 2,
}: SweepOptions = {}): Promise<SweepOutcome> {
  const store = getProbeStore();
  const startedAt = new Date().toISOString();

  const roster = await buildRoster(chainId, perCategory);

  let probeCount = 0;
  let answered = 0;
  let skipped = 0;
  let failed = 0;
  const errors = new Set<string>();

  // Agents are swept a few at a time: each one costs a registry lookup plus
  // several outbound probes, and hammering either side helps nobody.
  const batches = await mapWithConcurrency(roster, 4, async (entry) => {
    const agent = await getAgent(entry.chainId as ChainId, entry.tokenId).catch(
      (error: unknown) => {
        // A lookup failure is not a measurement. Recording nothing and
        // reporting success would quietly turn an outage on our side into an
        // apparent gap in the agent's record.
        failed += 1;
        errors.add((error as Error).message);
        return null;
      },
    );
    if (!agent) return [] as ProbeRecord[];

    if (!probeTarget(agent)) {
      skipped += 1;
      return [] as ProbeRecord[];
    }

    const reading = await probeAgent(agent, { samples });

    return reading.probes.map<ProbeRecord>((probe) => ({
      chainId: agent.chain_id,
      tokenId: agent.token_id,
      endpoint: reading.endpoint,
      protocol: reading.protocol,
      ok: probe.ok,
      latencyMs: probe.latencyMs,
      status: probe.status,
      detail: probe.detail,
      probedAt: probe.at,
    }));
  });

  const records = batches.flat();
  probeCount = records.length;
  answered = records.filter((r) => r.ok).length;

  store.record(records);

  const outcome: SweepOutcome = {
    startedAt,
    finishedAt: new Date().toISOString(),
    agents: roster.length,
    probes: probeCount,
    answered,
    skipped,
    failed,
    errors: [...errors],
  };

  store.recordSweep(outcome);
  return outcome;
}
