import 'server-only';

import { getAgent,
  listAgents,
} from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { BSC_MAINNET } from '@/lib/scan/types';
import { listMarketplace } from '@/lib/marketplace';
import { probeAgent, probeTarget } from '@/lib/proof/prober';
import { mapWithConcurrency } from '@/lib/concurrency';
import { requestQuote } from '@/lib/erc8183/quote';
import {
  getProbeStore,
  type ProbeRecord,
  type QuoteRecord,
  type SweepRecord,
} from './store';

export interface SweepOptions {
  chainId?: ChainId;
  /** Agents per category to pull into the roster. */
  perCategory?: number;
  /** Probes taken per agent per sweep. */
  samples?: number;
  /**
   * How deep to read the registry beyond what the marketplace lists.
   *
   * The roster was the four category listings and nothing else, so Pokter
   * measured about eighty agents and reported that as its coverage. Eighty out
   * of three hundred thousand is a sample, and a census built on a sample is
   * describing the shortlist rather than the registry.
   */
  registryDepth?: number;
}

export interface SweepOutcome extends SweepRecord {
  /** Agents skipped because they publish nothing probeable. */
  skipped: number;
  /** Agents we could not look up at all — rate limits, outages, bad ids. */
  failed: number;
  /** Distinct lookup failures, so a silent sweep can be diagnosed. */
  errors: string[];
  /** Agents that quoted a price for themselves this sweep. */
  quoted: number;
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
  registryDepth: number,
): Promise<{ chainId: number; tokenId: string }[]> {
  const store = getProbeStore();

  const sections = await listMarketplace({ chainId, limit: perCategory });
  const listed = sections.flatMap((section) =>
    section.listings.map((l) => ({
      chainId: l.agent.chain_id,
      tokenId: l.agent.token_id,
    })),
  );

  /*
   * The registry itself, not just the part of it Pokter has classified.
   *
   * Classification is a narrower gate than measurement: an agent has to fit
   * one of four financial categories to be listed, but any agent with an
   * endpoint can be called. Measuring only the classified ones meant the
   * census answered "how many of our listings answer" while being read as
   * "how many agents on this chain answer" — a much larger claim, and the one
   * the page is actually making.
   *
   * A page that fails is skipped rather than fatal: a wider roster is an
   * improvement to coverage, not a precondition for measuring the listings.
   */
  const fromRegistry: { chainId: number; tokenId: string }[] = [];
  const pageSize = 50;
  for (let offset = 0; offset < registryDepth; offset += pageSize) {
    const page = await listAgents({
      chainId,
      limit: Math.min(pageSize, registryDepth - offset),
      offset,
      sortBy: 'total_score',
      sortOrder: 'desc',
    }).catch(() => null);

    if (!page?.items?.length) break;
    for (const agent of page.items) {
      fromRegistry.push({ chainId: agent.chain_id, tokenId: agent.token_id });
    }
  }

  const seen = new Set<string>();
  /*
   * Agents that asked to be measured, ahead of the registry tier.
   *
   * A newly registered agent has no score, so the registry tier — ordered by
   * score and cut at a depth — would not reach it for a long time, and keyword
   * discovery only finds it if its description happens to match. Enrolment is
   * how a builder says "I exist, call me" without being able to say anything
   * about how well it went.
   */
  /*
   * Everything here belongs to the chain being swept.
   *
   * `trackedAgents` and `enrolledAgents` are stored across all chains and
   * were taken whole. That was harmless while only one chain was ever
   * swept, and stopped being harmless the moment a second pass was added:
   * the testnet sweep inherited every mainnet agent ever probed, so its
   * roster came out at 284 where its own settings allow about 74, and
   * every mainnet agent was called twice per sweep — doubling the load on
   * third-party endpoints this file elsewhere takes care not to hammer,
   * and doubling the rate its probe count climbs.
   *
   * It also made the testnet figures unreadable as a signal, which was the
   * entire reason for running the second pass.
   */
  const onThisChain = (entry: { chainId: number }) => entry.chainId === chainId;

  return [
    ...listed,
    ...store.trackedAgents().filter(onThisChain),
    ...store.enrolledAgents().filter(onThisChain),
    ...fromRegistry,
  ]
    .filter(onThisChain)
    .filter((entry) => {
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

/*
 * Registry agents pulled in per sweep, beyond the listed ones.
 *
 * Bounded on purpose. Each entry costs a detail lookup plus its probes, and
 * the run is on a two-hourly schedule against someone else's API — a sweep
 * that tries to call the whole registry once is a sweep that gets rate
 * limited and measures nothing. Ordered by the registry's own score so the
 * depth is spent on agents most likely to be real, and the store remembers
 * everything it has ever measured, so coverage accumulates across runs rather
 * than being re-earned every time.
 */
export const SWEEP_REGISTRY_DEPTH = 150;

export async function runSweep({
  chainId = BSC_MAINNET,
  perCategory = SWEEP_PER_CATEGORY,
  samples = 2,
  registryDepth = SWEEP_REGISTRY_DEPTH,
}: SweepOptions = {}): Promise<SweepOutcome> {
  const store = getProbeStore();
  const startedAt = new Date().toISOString();

  const roster = await buildRoster(chainId, perCategory, registryDepth);

  let probeCount = 0;
  let answered = 0;
  let skipped = 0;
  let failed = 0;
  const errors = new Set<string>();
  const quotes: QuoteRecord[] = [];

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

    /*
     * While we have the agent on the line, ask what it charges.
     *
     * The price is only obtainable by negotiating for it — no registry field
     * or agent card carries one — so the sweep is the one place already
     * paying the cost of reaching every agent. It is the same read-only
     * negotiation the trial runs: no funds move and nothing is written on
     * chain.
     *
     * An agent that will not quote simply has no row, and the interface says
     * so rather than substituting a default and calling it a price.
     */
    const quote = await requestQuote(agent);
    if (quote) {
      quotes.push({
        chainId: agent.chain_id,
        tokenId: agent.token_id,
        priceRaw: quote.priceRaw,
        priceU: quote.priceU,
        currency: quote.currency,
        signer: quote.signer,
        quotedAt: quote.quotedAt,
        expiresAt: quote.expiresAt,
      });
    }

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
  store.recordQuotes(quotes);

  const outcome: SweepOutcome = {
    startedAt,
    finishedAt: new Date().toISOString(),
    agents: roster.length,
    probes: probeCount,
    answered,
    skipped,
    failed,
    errors: [...errors],
    quoted: quotes.length,
  };

  store.recordSweep(outcome);
  return outcome;
}
