import 'server-only';

import {
  countAgents,
  getAgent,
  listAgents,
  listFeedbacks,
  searchAgents,
} from '@/lib/scan/client';
import type { ChainId, ScanAgent, ScanAgentDetail } from '@/lib/scan/types';
import { BSC_MAINNET } from '@/lib/scan/types';
import { classify, scoreCategories, CATEGORIES } from '@/lib/agents/categories';
import type { Category } from '@/lib/agents/categories';
import { toAttestation, type Attestation } from '@/lib/proof/attestation';
import { summariseProof, type ProofSummary } from '@/lib/proof/engine';
import { probeAgent, type LiveReading } from '@/lib/proof/prober';
import { mapWithConcurrency } from '@/lib/concurrency';
import { cache } from 'react';

import { getProbeStore, type QuoteRecord } from '@/lib/history/store';
import { buildTrackRecord, type TrackRecord } from '@/lib/history/record';
import { toSweepAttestation } from '@/lib/history/attest';
import { computeScore } from '@/lib/score/engine';
import { ScanError } from '@/lib/scan/client';
import type { PokterScore } from '@/lib/score/types';
import { getJobStore } from '@/lib/erc8183/store';
import { summariseEconomicHistory, type AgentEconomicHistory } from '@/lib/erc8183/economic-history';
import { getReviewStore } from '@/lib/reviews/store';
import { isPromotableAgent } from '@/lib/agents/eligibility';
import { preferDistinctOwners } from '@/lib/agents/diversity';
export { preferDistinctOwners };

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
  rebalancing: ['portfolio rebalancing agent maintaining target allocation'],
  'grid-trading': ['grid trading bot buy low sell high ladder'],
  yield: ['yield optimiser moving capital to the best APY'],
  'health-factor': ['health factor monitor preventing loan liquidation'],
};

/** A marketplace listing: a registry agent plus what we can prove about it. */
export interface Listing {
  agent: ScanAgent;
  category: Category;
  confidence: number;
  /** Cheap, list-level signal. Full proof is computed on the detail page. */
  attestationCount: number;
  /**
   * The last price this agent quoted for itself, if it has ever quoted one.
   *
   * Undefined where the caller did not join the quote store; null where it
   * did and the agent has never answered a price enquiry. The card has to
   * tell those apart, because "we did not ask" and "it would not say" are
   * different facts about an agent.
   */
  quote?: QuoteRecord | null;
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
export const listCategory = cache(async function listCategory(
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

  // Concurrency was capped at 3 to stay inside the anonymous 30/min limit. With
  // a key the ceiling is 600/min, and the real cost is now latency rather than
  // quota — so the slow semantic queries run alongside each other instead of
  // queueing behind one another.
  const pages = await mapWithConcurrency(lookups, 6, (run) =>
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
});

/** The full marketplace: every category, fetched in parallel, treated equally. */
export async function listMarketplace(
  options: { chainId?: ChainId; limit?: number } = {},
): Promise<{ category: Category; listings: Listing[] }[]> {
  // All four categories at once. The inner fan-out is what used to trip the
  // rate limit; with a key in place, serialising categories only adds the
  // slowest semantic query's latency four times over.
  return mapWithConcurrency(CATEGORIES, 4, async ({ id }) => ({
    category: id,
    listings: await listCategory(id, options),
  }));
}

/** Everything the detail page needs to justify or warn against a hire. */
export interface AgentDossier {
  agent: ScanAgentDetail;
  category: ReturnType<typeof classify>;
  /** Third-party attestations read from chain. */
  attestations: Attestation[];
  proof: ProofSummary;
  live: LiveReading;
  /** What our own scheduled sweeps have accumulated. */
  record: TrackRecord;
  /** The transparent evaluation shown on the detail page. */
  score: PokterScore;
  /**
   * The last price this agent signed for itself, and whether it still
   * stands. The hire form needs it: without the agent's own price it fell
   * back to a flat budget, so an agent advertising 0.05 was funded at 0.10.
   */
  quote: QuoteRecord | null;
  quoteCurrent: boolean;
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
    // One protocol handshake keeps the decision current without adding three
    // serial network round trips to every dossier. Scheduled sweeps remain the
    // source of repeated-sample reliability evidence.
    probeAgent(agent, { samples: 1 }),
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

  const proof = summariseProof(sweep ? [...attestations, sweep] : attestations);
  const category = classify(agent);

  const quote =
    getProbeStore().quotesFor([{ chainId, tokenId }]).get(`${chainId}:${tokenId}`) ??
    null;

  return {
    agent,
    category,
    attestations,
    proof,
    live,
    record,
    score: computeScore({ agent, category, proof, attestations, record, live }),
    quote,
    quoteCurrent: Boolean(
      quote && (!quote.expiresAt || Date.parse(quote.expiresAt) > Date.now()),
    ),
  };
}

/** §14. Live ecosystem figures. Every number here is counted, never estimated. */
export interface EcosystemStats {
  /** Agents in the ERC-8004 registry on this chain, per 8004scan. */
  registered: number | null;
  categories: number;
  agentsMonitored: number;
  /** Of those, how many have ever answered. The gap is the product's point. */
  agentsAnswering: number;
  probesTaken: number;
  probesAnswered: number;
  sweeps: number;
}

export async function getEcosystemStats(
  chainId: ChainId = BSC_MAINNET,
): Promise<EcosystemStats> {
  const [page, stats] = await Promise.all([
    countAgents(chainId).catch(() => null),
    Promise.resolve(getProbeStore().stats()),
  ]);

  return {
    // Null rather than zero when the registry is unreachable: "we could not
    // read it" and "there are none" are different claims.
    registered: page?.total ?? null,
    categories: CATEGORIES.length,
    ...stats,
  };
}

/**
 * A comparison entry: everything the compare table needs, without the live
 * probe.
 *
 * Comparing four agents would otherwise mean twelve outbound requests and
 * several seconds of latency for a sample that adds nothing — the accumulated
 * track record is the better evidence, and the detail page is where a
 * request-time probe belongs.
 */
export interface Comparison {
  agent: ScanAgentDetail;
  category: ReturnType<typeof classify>;
  proof: ProofSummary;
  record: TrackRecord;
  score: PokterScore;
  quote: QuoteRecord | null;
  quoteCurrent: boolean;
  economicHistory: AgentEconomicHistory;
  reviewCount: number;
  reviewAverage: number | null;
}

export async function getComparison(
  chainId: ChainId,
  tokenId: string,
): Promise<Comparison> {
  const agent = await getAgent(chainId, tokenId);

  const feedbackPage = await listFeedbacks({
    chainId,
    agentId: agent.id,
    limit: 50,
  }).catch(() => ({ items: [], total: 0, limit: 0, offset: 0 }));

  const attestations = feedbackPage.items.map(toAttestation);
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
  const record = buildTrackRecord(
    getProbeStore().historyFor(chainId, tokenId, since),
  );

  const sweep = toSweepAttestation(record, { agentId: agent.id, chainId });
  const proof = summariseProof(sweep ? [...attestations, sweep] : attestations);
  const category = classify(agent);
  const quote = getProbeStore().quotesFor([{ chainId, tokenId }]).get(`${chainId}:${tokenId}`) ?? null;
  const economicHistory = summariseEconomicHistory(getJobStore().byAgent(chainId, tokenId));
  const reviews = getReviewStore().byAgent(chainId, tokenId);

  return {
    agent,
    category,
    proof,
    record,
    score: computeScore({ agent, category, proof, attestations, record }),
    quote,
    quoteCurrent: Boolean(
      quote && (!quote.expiresAt || Date.parse(quote.expiresAt) > Date.now()),
    ),
    economicHistory,
    reviewCount: reviews.length,
    reviewAverage: reviews.length
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : null,
  };
}

/** Resolve a set of "chainId:tokenId" keys, skipping any that cannot be read. */
export async function getComparisons(keys: string[]): Promise<Comparison[]> {
  const parsed = keys
    .map((key) => key.split(':'))
    .filter((parts): parts is [string, string] => parts.length === 2)
    .map(([chainId, tokenId]) => ({ chainId: Number(chainId) as ChainId, tokenId }))
    .filter((entry) => entry.chainId === 56 || entry.chainId === 97);

  const results = await mapWithConcurrency(parsed, 3, (entry) =>
    getComparison(entry.chainId, entry.tokenId).catch(() => null),
  );

  return results.filter((entry): entry is Comparison => entry !== null);
}

/**
 * Every listed agent, joined to what Pokter has measured about it.
 *
 * Used by search, which filters across all categories at once rather than
 * within one. The probe history comes from local storage, so enriching costs
 * nothing beyond the category queries themselves.
 */
export async function listSearchable(
  options: { chainId?: ChainId; limit?: number } = {},
): Promise<
  { listing: Listing; record: TrackRecord; history: AgentEconomicHistory }[]
> {
  const sections = await listMarketplace(options);
  const store = getProbeStore();
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);

  const all = sections.flatMap(({ listings }) => listings);
  const quotes = store.quotesFor(
    all.map((l) => ({ chainId: l.agent.chain_id, tokenId: l.agent.token_id })),
  );

  /*
   * What happened to the jobs, carried at list level.
   *
   * It was already on the agent page and in the comparison table, which is
   * where a reader ends up after choosing — and the choosing happens in the
   * grid. An agent that answers every probe and completes no job looked
   * identical there to one that delivers, because availability was the only
   * outcome a card could show.
   *
   * Reads the local job index, so this costs nothing the category queries
   * were not already paying.
   */
  const jobs = getJobStore();

  return all.map((listing) => ({
    listing: {
      ...listing,
      quote:
        quotes.get(`${listing.agent.chain_id}:${listing.agent.token_id}`) ?? null,
    },
    record: buildTrackRecord(
      store.historyFor(listing.agent.chain_id, listing.agent.token_id, since),
    ),
    history: summariseEconomicHistory(
      jobs.byAgent(listing.agent.chain_id, listing.agent.token_id),
    ),
  }));
}

/** One category enriched with the same track record used by search and cards. */
export async function listCategorySearchable(
  category: Category,
  options: { chainId?: ChainId; limit?: number } = {},
): Promise<
  { listing: Listing; record: TrackRecord; history: AgentEconomicHistory }[]
> {
  const listings = await listCategory(category, options);
  const store = getProbeStore();
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);

  const quotes = store.quotesFor(
    listings.map((l) => ({
      chainId: l.agent.chain_id,
      tokenId: l.agent.token_id,
    })),
  );

  /*
   * What happened to the jobs, carried at list level.
   *
   * It was already on the agent page and in the comparison table, which is
   * where a reader ends up after choosing — and the choosing happens in the
   * grid. An agent that answers every probe and completes no job looked
   * identical there to one that delivers, because availability was the only
   * outcome the card could show.
   *
   * Reads the local job index, so this costs nothing the category queries
   * were not already paying.
   */
  const jobs = getJobStore();

  return listings.map((listing) => ({
    listing: {
      ...listing,
      quote:
        quotes.get(`${listing.agent.chain_id}:${listing.agent.token_id}`) ?? null,
    },
    record: buildTrackRecord(
      store.historyFor(listing.agent.chain_id, listing.agent.token_id, since),
    ),
    history: summariseEconomicHistory(
      jobs.byAgent(listing.agent.chain_id, listing.agent.token_id),
    ),
  }));
}



/**
 * A dossier lookup that distinguishes absent from unreachable.
 *
 * `getDossier` throwing means one of several things, and the pages that call it
 * were treating all of them as "not found" — so a rate limit or a cold-cache
 * timeout told visitors an agent did not exist. Only a genuine 404 from the
 * registry means that.
 */
export type DossierResult =
  | { state: 'ok'; dossier: AgentDossier }
  | { state: 'missing' }
  | { state: 'unreachable' };

export async function loadDossier(
  chainId: ChainId,
  tokenId: string,
): Promise<DossierResult> {
  try {
    return { state: 'ok', dossier: await getDossier(chainId, tokenId) };
  } catch (error) {
    if (error instanceof ScanError && error.status === 404) {
      return { state: 'missing' };
    }
    return { state: 'unreachable' };
  }
}

/** A stronger same-category alternative offered for a high-risk hire. */
export interface Alternative {
  listing: Listing;
  verdict: ProofSummary['verdict'];
  answered: number;
  probes: number;
}

/**
 * Agents in the same category that are worth trying instead.
 *
 * FE-01. A high-risk hire used to end in an empty screen, which sends a quest
 * user to finish the category on somebody else's marketplace. A strong warning
 * and explicit acceptance are right; silently making the decision is not.
 *
 * Deliberately built from the category listing and the local probe record
 * only. Resolving a full dossier per candidate would mean a live probe each,
 * turning a dead end into a slow dead end. The trade is that these are agents
 * that have been answering, not agents guaranteed to answer this second — so
 * the UI says "recently" rather than implying a promise.
 */
export async function recommendedAlternatives(
  category: Category,
  excludeTokenId: string,
  limit = 3,
): Promise<Alternative[]> {
  const listings = await listCategory(category, { limit: 12 });
  const store = getProbeStore();
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);

  const ranked = listings
    .filter(
      (listing) =>
        listing.agent.token_id !== excludeTokenId &&
        isPromotableAgent(listing.agent),
    )
    .map((listing) => {
      const history = store.historyFor(
        listing.agent.chain_id,
        listing.agent.token_id,
        since,
      );
      const answered = history.filter((probe) => probe.ok).length;
      const sweep = toSweepAttestation(buildTrackRecord(history), {
        agentId: listing.agent.id,
        chainId: listing.agent.chain_id,
      });
      return {
        listing,
        verdict: summariseProof(sweep ? [sweep] : []).verdict,
        answered,
        probes: history.length,
      };
    })
    // Only agents with a record of answering. An alternative that has never
    // responded is the problem being solved, not a way out of it.
    .filter((entry) => entry.probes > 0 && entry.answered > 0)
    .sort(
      (a, b) => b.answered / b.probes - a.answered / a.probes || b.probes - a.probes,
    );

  return preferDistinctOwners(ranked, limit);
}

/**
 * One agent per publisher first, then fill from what is left.
 *
 * FE-19. Ranking alone offered three members of the same family — distinct
 * registry entries with strong records, but not three choices. On the screen
 * where somebody has just been refused, variety is most of the value; a
 * second opinion from the same publisher is barely a second opinion.
 *
 * Order within each pass is preserved, so the best agent from each publisher
 * still leads and nothing is promoted over a stronger record from elsewhere.
 */
/**
 * How many listings each publisher holds across the indexed set.
 *
 * Two operators account for eighteen of the eighty entries by registering the
 * same agent repeatedly. Collapsing them would make the marketplace look
 * tidier by making the census less true — "80 curated listings" is the honest
 * count of what the registry contains, and it appears on pages whose whole job
 * is to be that count. So the concentration is reported instead of removed,
 * and a card can say how much of the catalogue its publisher is.
 */
export function listingsPerOwner<T extends { listing: Listing }>(
  entries: T[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const owner = entry.listing.agent.owner_address?.toLowerCase();
    if (!owner) continue;
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return counts;
}
