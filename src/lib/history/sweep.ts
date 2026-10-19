import 'server-only';

import { getAgent,
  listAgents,
} from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { BSC_MAINNET } from '@/lib/scan/types';
import { listMarketplace } from '@/lib/marketplace';
import { probeAgent, probeTarget } from '@/lib/proof/prober';
import { mapWithConcurrency } from '@/lib/concurrency';
import {
  SWEEP_BUDGET_MS,
  SWEEP_MAX_AGENTS,
  SWEEP_REGISTRY_PAGE,
  registryPageOffset,
  sweepBatch,
} from './schedule';
import { POKTER_TERMS, requestQuote } from '@/lib/erc8183/quote';
import { sampleBrief } from '@/lib/erc8183/sample-enquiry';
import { classify } from '@/lib/agents/categories';
import {
  getProbeStore,
  type ProbeRecord,
  type QuoteFailureRecord,
  type QuoteRecord,
  type SweepRecord,
} from './store';
import { getQuestStore } from '@/lib/quest/store';
import { PROBE_ADAPTER } from '@/lib/proof/probe-target';
import type { QuoteFailure } from '@/lib/hire/failure';

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
  /**
   * Agents measured in this run, stalest first.
   *
   * A sweep used to take the whole roster. See `SWEEP_MAX_AGENTS`.
   */
  maxAgents?: number;
  /** Wall-clock budget: once it is spent, no further agent is started. */
  budgetMs?: number;
  /**
   * The caller's abort signal, if it has one.
   *
   * A sweep is reached through a request. When that request goes away — the
   * client gave up, the platform cut it off — the work behind it should stop
   * too, rather than carrying on against endpoints nobody is waiting on.
   */
  signal?: AbortSignal;
}

export interface SweepOutcome extends SweepRecord {
  /**
   * Agents eligible this run, of which `agents` were measured.
   *
   * The gap between the two is the roster this sweep did not reach; the next
   * run starts with whatever has gone longest unmeasured, so the gap closes
   * over successive runs rather than within one.
   */
  rosterSize: number;
  /** Agents in the batch dropped unmeasured because the budget ran out. */
  unmeasured: number;
  /** True when the run stopped on its budget or an abort, not on its batch. */
  cutShort: boolean;
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
  const offset = registryPageOffset(Date.now(), registryDepth);
  const page = await listAgents({
    chainId,
    limit: Math.min(SWEEP_REGISTRY_PAGE, Math.max(registryDepth - offset, 0)),
    offset,
    sortBy: 'total_score',
    sortOrder: 'desc',
  }).catch(() => null);

  for (const agent of page?.items ?? []) {
    fromRegistry.push({ chainId: agent.chain_id, tokenId: agent.token_id });
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

  /*
   * Agents that are for sale, whatever their classification or score.
   *
   * Stockroom signed a price for Pokter and was hireable from its page,
   * but it is unclassified and new, so neither the listing nor the scored
   * registry tier reached it and it had no scheduled check at all. An agent
   * Pokter will take payment for is an agent Pokter should measure: one
   * that has signed a price, or whose wallet escrow has paid.
   */
  let hired: { chainId: number; tokenId: string }[] = [];
  try {
    hired = getQuestStore().hiredAgents();
  } catch {
    /* The job index is a convenience here; the other tiers still stand. */
  }

  return [
    ...listed,
    ...store.trackedAgents().filter(onThisChain),
    ...store.enrolledAgents().filter(onThisChain),
    ...store.quotedAgents().filter(onThisChain),
    ...hired.filter(onThisChain),
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
 * the run is scheduled against someone else's API — a sweep that tries to
 * call the whole registry once is a sweep that gets rate limited and measures
 * nothing. Ordered by the registry's own score so the depth is spent on
 * agents most likely to be real, and the store remembers everything it has
 * ever measured, so coverage accumulates across runs rather than being
 * re-earned every time.
 *
 * This is the depth a rotation covers, not the depth of one run:
 * `registryPageOffset` reads one page per run and advances it, so three runs
 * cover 150 and each costs a single listing call.
 */
export const SWEEP_REGISTRY_DEPTH = 150;

export async function runSweep({
  chainId = BSC_MAINNET,
  perCategory = SWEEP_PER_CATEGORY,
  samples = 2,
  registryDepth = SWEEP_REGISTRY_DEPTH,
  maxAgents = SWEEP_MAX_AGENTS,
  budgetMs = SWEEP_BUDGET_MS,
  signal,
}: SweepOptions = {}): Promise<SweepOutcome> {
  const store = getProbeStore();
  const startedAt = new Date().toISOString();

  /*
   * The clock starts before the roster, not after it.
   *
   * Building the roster is two listing calls against someone else's API, and
   * a sweep whose budget began once they returned was a sweep with no bound
   * on its slowest part. Each call carries its own timeout, so the roster
   * cannot hang — but it can be slow, and when it is, this run measures
   * fewer agents rather than running longer than it was allowed to.
   */
  const deadline = Date.now() + budgetMs;
  const roster = await buildRoster(chainId, perCategory, registryDepth);
  const batch = sweepBatch(roster, store.lastProbedAt(chainId), maxAgents);

  let probeCount = 0;
  let answered = 0;
  let skipped = 0;
  let failed = 0;
  const errors = new Set<string>();
  const quotes: QuoteRecord[] = [];
  const quoteFailures: QuoteFailureRecord[] = [];
  const access: { chainId: number; tokenId: string; requiresAuth: boolean; observedAt: string }[] = [];
  let unmeasured = 0;

  // Agents are swept a few at a time: each one costs a registry lookup plus
  // several outbound probes, and hammering either side helps nobody.
  const batches = await mapWithConcurrency(batch, 4, async (entry) => {
    /*
     * The budget, checked before each agent rather than around the run.
     *
     * `mapWithConcurrency` hands out work as slots free up, so a deadline
     * tested here stops the queue advancing without interrupting the four
     * agents already in flight — each of which is bounded by its own
     * outbound timeouts. What has been measured so far is still recorded:
     * a run that ends early is a shorter run, not a lost one.
     */
    if (signal?.aborted || Date.now() >= deadline) {
      unmeasured += 1;
      return [] as ProbeRecord[];
    }

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
    // Only a card that was actually read says anything about access.
    if (reading.protocol === 'a2a' && reading.answered > 0) {
      access.push({ chainId: agent.chain_id, tokenId: agent.token_id, requiresAuth: reading.requiresAuth, observedAt: new Date().toISOString() });
    }

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
    // Why it would not quote, kept: the agent's page says so to its owner.
    let failure: QuoteFailure | null = null;
    let refusal: string | null = null;
    let quote = await requestQuote(agent, {
      onFailure: (reason) => {
        failure = reason;
      },
      onRefused: (reason) => {
        refusal = reason;
      },
    });
    /*
     * Declined the generic enquiry: ask once more with a concrete job in its
     * category. An agent that will not price unseen work is right not to,
     * and recording that as "it declines" blamed it for Pokter's question.
     * Only after a stated refusal, so an agent that is down or unsigned is
     * not asked twice.
     */
    const sample = !quote && refusal ? sampleBrief(classify(agent)) : null;
    if (sample) {
      let retryFailure: QuoteFailure | null = null;
      let retryRefusal: string | null = null;
      const retried = await requestQuote(agent, {
        enquiry: { task_description: sample, terms: POKTER_TERMS },
        onFailure: (reason) => {
          retryFailure = reason;
        },
        onRefused: (reason) => {
          retryRefusal = reason;
        },
      });
      if (retried) {
        quote = retried;
        failure = null;
        refusal = null;
      } else if (retryFailure) {
        // What it said to a real brief is the more useful finding.
        failure = retryFailure;
        refusal = retryRefusal ?? refusal;
      }
    }
    if (!quote && failure) {
      const known = failure as QuoteFailure;
      quoteFailures.push({ chainId: agent.chain_id, tokenId: agent.token_id, code: known.code, detail: known.detail ?? null, sellerReason: refusal ?? known.sellerReason ?? null, observedAt: new Date().toISOString() });
    }
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
        domain: quote.domain,
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
      adapter: PROBE_ADAPTER,
    }));
  });

  const records = batches.flat();
  probeCount = records.length;
  answered = records.filter((r) => r.ok).length;

  store.record(records);
  store.recordQuotes(quotes);
  store.recordQuoteOutcomes(quoteFailures, quotes.map((q) => ({ chainId: q.chainId, tokenId: q.tokenId })));
  store.recordCardAccess(access);

  const outcome: SweepOutcome = {
    startedAt,
    finishedAt: new Date().toISOString(),
    // What this run measured, which is what `skipped` and `failed` are counted
    // against. The roster it was drawn from is reported separately.
    agents: batch.length - unmeasured,
    probes: probeCount,
    answered,
    skipped,
    failed,
    errors: [...errors],
    quoted: quotes.length,
    rosterSize: roster.length,
    unmeasured,
    cutShort: unmeasured > 0,
  };

  store.recordSweep(outcome);
  return outcome;
}
