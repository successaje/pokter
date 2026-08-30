import 'server-only';

import { getAgent, listAgents, listFeedbacks, searchAgents } from '@/lib/scan/client';
import type { ChainId, ScanAgent, ScanAgentDetail } from '@/lib/scan/types';
import { BSC_MAINNET } from '@/lib/scan/types';
import { classify, scoreCategories, CATEGORIES } from '@/lib/agents/categories';
import type { Category } from '@/lib/agents/categories';
import { toAttestation, type Attestation } from '@/lib/proof/attestation';
import { summariseProof, type ProofSummary } from '@/lib/proof/engine';
import { probeAgent, type LiveReading } from '@/lib/proof/prober';
import { mapWithConcurrency } from '@/lib/concurrency';
import { getProbeStore } from '@/lib/history/store';
import { buildTrackRecord, type TrackRecord } from '@/lib/history/record';
import { toSweepAttestation } from '@/lib/history/attest';

/**
 * Retrieval is deliberately hybrid.
 *
 * Semantic search finds agents that describe the job in their own words, but it
 * reliably misses agents whose name *is* the keyword — searching it for grid
 * strategies returns generic trading bots while thirteen agents with "Grid" in
 * the title sit unretrieved. Keyword search catches exactly those. Neither path
 * alone covers a category; the classifier then filters both.
 */
const KEYWORD_TERMS: Record<Category, string[]> = {
  rebalancing: ['rebalanc', 'allocation'],
  'grid-trading': ['grid', 'ladder'],
  yield: ['yield', 'vault'],
  'health-factor': ['health factor', 'liquidation'],
};

const DISCOVERY_QUERIES: Record<Category, string[]> = {
  rebalancing: [
    'portfolio rebalancing agent maintaining target allocation',
    'automated portfolio weight management on BNB Chain',
  ],
  'grid-trading': [
    'grid trading bot buy low sell high ladder',
    'automated range trading strategy on BSC',
    'DCA bot placing staggered limit orders',
    'market making bot quoting a spread on PancakeSwap',
  ],
  yield: [
    'yield optimiser moving capital to the best APY',
    'DeFi yield aggregator auto compounding vault',
  ],
  'health-factor': [
    'health factor monitor preventing loan liquidation',
    'Venus lending position liquidation protection',
  ],
};

/** A marketplace listing: a registry agent plus what we can prove about it. */
export interface Listing {
  agent: ScanAgent;
  category: Category;
  confidence: number;
  /** Cheap, list-level signal. Full proof is computed on the detail page. */
  attestationCount: number;
}

function dedupe(agents: ScanAgent[]): ScanAgent[] {
  const seen = new Set<string>();
  return agents.filter((a) => {
    if (seen.has(a.token_id)) return false;
    seen.add(a.token_id);
    return true;
  });
}

/**
 * Collapse clone farms.
 *
 * Large parts of the registry are minted in bulk: dozens of agents sharing one
 * identical description ("Automated portfolio rebalancing") under sequential
 * names. Showing four of them crowds out real agents and tells the user nothing,
 * so we keep the best-evidenced representative of each identical description.
 */
function collapseClones(listings: Listing[]): Listing[] {
  const best = new Map<string, Listing>();

  for (const listing of listings) {
    const key = (listing.agent.description ?? '').trim().toLowerCase();
    // Agents with no description at all are not necessarily clones of each
    // other, so they are keyed individually and always kept.
    const dedupeKey = key === '' ? `__unique:${listing.agent.token_id}` : key;

    const incumbent = best.get(dedupeKey);
    if (!incumbent || rank(listing) > rank(incumbent)) {
      best.set(dedupeKey, listing);
    }
  }

  return [...best.values()];
}

/**
 * Ordering signal. Evidence dominates; after that we prefer agents that publish
 * a service endpoint, since an agent we can probe is one the user can actually
 * watch — which is the entire promise of the marketplace.
 */
function rank(listing: Listing): number {
  const probeable = (listing.agent.supported_protocols ?? []).length > 0 ? 1 : 0;
  return (
    listing.attestationCount * 1000 +
    probeable * 100 +
    listing.confidence * 10 +
    listing.agent.total_score / 100
  );
}

/**
 * Build the listing set for one category.
 *
 * Ordering puts agents that carry *any* on-chain evidence first — in a registry
 * where the median agent is unproven, having a record at all is the strongest
 * differentiator we can surface cheaply.
 */
export async function listCategory(
  category: Category,
  { chainId = BSC_MAINNET, limit = 8 }: { chainId?: ChainId; limit?: number } = {},
): Promise<Listing[]> {
  const queries = DISCOVERY_QUERIES[category];

  const empty = { items: [] as ScanAgent[], total: 0, limit: 0, offset: 0 };

  const lookups: (() => Promise<typeof empty>)[] = [
    ...queries.map((q) => () => searchAgents(q, { chainId, limit: 12 })),
    ...KEYWORD_TERMS[category].map(
      (term) => () => listAgents({ chainId, search: term, limit: 20 }),
    ),
  ];

  const pages = await mapWithConcurrency(lookups, 3, (run) =>
    run().catch(() => empty),
  );

  const candidates = dedupe(pages.flatMap((p) => p.items));

  const scored: Listing[] = candidates
    .map((agent) => {
      const [best] = scoreCategories(agent);
      return {
        agent,
        category,
        confidence: best?.confidence ?? 0,
        attestationCount: agent.total_feedbacks,
      };
    })
    // Only keep agents our own classifier agrees belong in this category.
    .filter((l) => classify(l.agent) === category);

  return collapseClones(scored)
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, limit);
}

/** The full marketplace: every category, fetched in parallel, treated equally. */
export async function listMarketplace(
  options: { chainId?: ChainId; limit?: number } = {},
): Promise<{ category: Category; listings: Listing[] }[]> {
  // Categories are fetched two at a time rather than all four at once: each one
  // fans out internally, and the product of the two fan-outs is what trips the
  // rate limit.
  return mapWithConcurrency(CATEGORIES, 2, async ({ id }) => ({
    category: id,
    listings: await listCategory(id, options),
  }));
}

/** Everything the agent detail page needs to justify (or refuse) a hire. */
export interface AgentDossier {
  agent: ScanAgentDetail;
  category: ReturnType<typeof classify>;
  /** Third-party attestations read from chain. */
  attestations: Attestation[];
  proof: ProofSummary;
  live: LiveReading;
  /** What our own scheduled sweeps have accumulated. */
  record: TrackRecord;
}

/** How far back the detail page reads accumulated history. */
const HISTORY_DAYS = 30;

/**
 * Assemble the full evidence dossier for one agent: third-party attestations
 * from chain, plus a live first-party reading taken at request time.
 */
export async function getDossier(
  chainId: ChainId,
  tokenId: string,
): Promise<AgentDossier> {
  const agent = await getAgent(chainId, tokenId);

  const [feedbackPage, live] = await Promise.all([
    listFeedbacks({ chainId, agentId: agent.id, limit: 50 }).catch(() => ({
      items: [],
      total: 0,
      limit: 0,
      offset: 0,
    })),
    probeAgent(agent, { samples: 3 }),
  ]);

  const attestations = feedbackPage.items.map(toAttestation);

  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
  const record = buildTrackRecord(
    getProbeStore().historyFor(chainId, tokenId, since),
  );

  // Our accumulated sweeps count as evidence alongside third-party
  // attestations, which is the point of measuring on a schedule: without it an
  // agent nobody else has checked can never be anything but unproven.
  const sweep = toSweepAttestation(record, { agentId: agent.id, chainId });

  return {
    agent,
    category: classify(agent),
    attestations,
    proof: summariseProof(sweep ? [...attestations, sweep] : attestations),
    live,
    record,
  };
}
