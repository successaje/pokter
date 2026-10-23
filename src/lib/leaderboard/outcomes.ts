import type { HiredJob } from '@/lib/erc8183/types';
import type { BoardAgent } from './network';

/**
 * The metrics the outcomes board may be ordered by, one at a time.
 *
 * There is deliberately no fourth entry combining them. A composite would
 * put the ordering beyond checking: a reader could not tell which fact moved
 * a row, and could not reproduce the order from the figures on screen. Each
 * id below names one column, and that column's header is the whole
 * explanation of the order.
 */
export type OutcomeMetric = 'settled-jobs' | 'external-buyers' | 'repeat-buyers';

export interface OutcomeMetricMeta {
  id: OutcomeMetric;
  /** The column header. It names exactly what produced the order. */
  column: string;
  /**
   * The column header split for a shared card's fact column, which is about
   * 340px wide at 18px: `short` is the label, `qualifier` the line under the
   * figure, and the two together have to read as `column` does. Split rather
   * than truncated — "Settled jobs" alone would drop the delivery-evidence
   * condition, which is the whole difference between this figure and a count
   * of escrow releases.
   */
  short: string;
  qualifier: string;
  /** What the number counts, with its population spelled out. */
  definition: string;
}

export const OUTCOME_METRICS: readonly OutcomeMetricMeta[] = [
  {
    id: 'settled-jobs',
    column: 'Settled jobs with delivery evidence',
    short: 'Settled jobs',
    qualifier: 'with delivery evidence, external buyers',
    definition:
      'Escrow jobs on this network that reached COMPLETED, funded by a wallet outside Pokter’s declared team set, not a self-hire, not a lifecycle demonstration, and whose delivery was submitted by the agent’s own wallet or carried the agent’s own answer in its manifest. A count, not a rate.',
  },
  {
    id: 'external-buyers',
    column: 'Distinct external buyer wallets',
    short: 'External buyers',
    qualifier: 'distinct funding wallets',
    definition:
      'Distinct funding wallets behind those settled jobs. One wallet counts once however many jobs it paid for.',
  },
  {
    id: 'repeat-buyers',
    column: 'Repeat external buyer wallets',
    short: 'Repeat buyers',
    qualifier: 'wallets that settled more than once',
    definition:
      'Of those wallets, the ones that settled more than one job with this agent. The strongest signal on this board, and the scarcest.',
  },
];

export const OUTCOME_METRIC_BY_ID = new Map(OUTCOME_METRICS.map((metric) => [metric.id, metric]));

export function outcomeMetricFrom(raw: string | string[] | undefined): OutcomeMetric {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'external-buyers' || value === 'repeat-buyers' ? value : 'settled-jobs';
}

/**
 * Who submitted a delivery, and therefore whether it is evidence about the
 * agent at all.
 *
 * This is the distinction `delivery-kind.ts` and `economic-history.ts` exist
 * to keep, applied here because a leaderboard is the surface where losing it
 * would do the most damage. Delivery evidence is not a status flag:
 * `COMPLETED` says the escrow released, and Pokter's own courier can take a
 * job to `COMPLETED` with nothing from the agent in it.
 */
export type DeliverySubmitter =
  /** The provider is a wallet Pokter does not declare: the agent delivered itself. */
  | 'agent-wallet'
  /** Pokter's courier submitted, and the manifest carries this agent's own answer. */
  | 'relayed-answer'
  /** A declared Pokter wallet submitted, with no manifest naming this agent's answer. */
  | 'pokter-courier'
  /** Delivered, but the row records no provider. Not evidence either way. */
  | 'unknown'
  /** Nothing was delivered. */
  | 'none';

/** Whether the submitter is evidence that *this agent* did the work. */
export function isAgentDelivery(submitter: DeliverySubmitter): boolean {
  return submitter === 'agent-wallet' || submitter === 'relayed-answer';
}

/**
 * The classification callbacks, injected rather than imported.
 *
 * `isLifecycleDemo` and `isRelayedDelivery` sit behind `server-only` because
 * they read the deliverable store, so importing them here would put this
 * module out of reach of the test runner. Passed in, exactly as
 * `summariseEconomicHistory` takes them, so the rules are exercised against
 * fixtures instead of asserted by reading.
 */
export interface OutcomeTests {
  /** Funded by a declared Pokter wallet, or with no recorded funder at all. */
  teamFunded: (job: HiredJob) => boolean;
  /** Buyer and seller the same wallet: an operator paying their own agent. */
  selfHire: (job: HiredJob) => boolean;
  /** Pokter's seller closing a receipt with no answer from the agent in it. */
  lifecycleDemo: (job: HiredJob) => boolean;
  /** The manifest carries this agent's own answer, submitted by Pokter's courier. */
  relayedDelivery: (job: HiredJob) => boolean;
  /** Whether an address is one Pokter declares as its own. */
  operatorWallet: (address: string) => boolean;
}

/**
 * Who owed the delivery, from the provider address alone.
 *
 * Read separately from `deliverySubmitter` because an undelivered job has no
 * manifest to read and no submitter yet, while still having somebody on the
 * hook for it. Job 97/1582 is the case: outside-funded, still `FUNDED`, and
 * the provider is Pokter's operator key — so it is Pokter's undelivered job,
 * not the agent's. Job 97/1562 is the same shape after expiry. Without this
 * split both would read as an agent that takes money and does not deliver,
 * which is the mistake `economic-history.ts` keeps `operatorMissed` apart
 * from `missed` to avoid.
 */
export type OwedBy = 'pokter' | 'agent' | 'unknown';

export function owedBy(job: HiredJob, tests: OutcomeTests): OwedBy {
  const provider = typeof job.provider === 'string' ? job.provider.toLowerCase() : null;
  if (provider === null) return 'unknown';
  return tests.operatorWallet(provider) ? 'pokter' : 'agent';
}

export function deliverySubmitter(job: HiredJob, tests: OutcomeTests): DeliverySubmitter {
  if (job.status !== 'SUBMITTED' && job.status !== 'COMPLETED') return 'none';
  /*
   * The manifest is read before the address, for the reason
   * `carriesRelayedAnswerFor` gives: the courier submits from a Pokter wallet
   * whichever agent produced the answer, so the address alone can only ever
   * say "a Pokter wallet delivered this". Positive manifest evidence
   * therefore outranks a missing or team-owned provider.
   */
  if (tests.relayedDelivery(job)) return 'relayed-answer';
  const owed = owedBy(job, tests);
  if (owed === 'unknown') return 'unknown';
  return owed === 'pokter' ? 'pokter-courier' : 'agent-wallet';
}

/**
 * Whether a job names an ERC-8004 identity Pokter can attribute it to.
 *
 * Eight of the indexed rows carry no numeric agent token id — early
 * demonstration jobs from before the envelope recorded one. `jobAgentKey`
 * would happily mint a key for them out of the escrow chain, inventing an
 * attribution the row does not support, so they are counted in coverage and
 * never given a row. The same test the proof page uses, for the same reason.
 */
export function isAttributed(job: HiredJob): boolean {
  return /^\d+$/.test(job.agentTokenId);
}

/** Why a job on this escrow chain is not in an agent's settled count. */
export type OutcomeExclusion =
  | 'unattributed'
  | 'team-funded'
  | 'self-hire'
  | 'lifecycle-demo'
  | 'pokter-courier'
  | 'pokter-owed'
  | 'unknown-submitter'
  | 'agent-undelivered';

export interface JobVerdict {
  /** Externally funded, delivered by the agent, and settled. Counts. */
  counts: boolean;
  /** Externally funded and delivered by the agent, but the escrow has not released. */
  deliveredUnsettled: boolean;
  submitter: DeliverySubmitter;
  owed: OwedBy;
  exclusion: OutcomeExclusion | null;
}

/**
 * One job's standing on the outcomes board.
 *
 * The order is the order a reader would check in: can this job be attributed
 * at all, then who paid, then whether the pair is two sides of one operator,
 * then whether anything was actually produced and by whom, then whether the
 * escrow released. Every rejection is named, so the page can publish the
 * exclusions rather than only their effect.
 */
export function judgeJob(job: HiredJob, tests: OutcomeTests): JobVerdict {
  const submitter = deliverySubmitter(job, tests);
  const owed = owedBy(job, tests);
  const reject = (exclusion: OutcomeExclusion): JobVerdict => ({
    counts: false,
    deliveredUnsettled: false,
    submitter,
    owed,
    exclusion,
  });
  if (!isAttributed(job)) return reject('unattributed');
  if (tests.teamFunded(job)) return reject('team-funded');
  if (tests.selfHire(job)) return reject('self-hire');
  if (tests.lifecycleDemo(job)) return reject('lifecycle-demo');
  if (submitter === 'none') {
    // Nothing delivered. Whose failure that is turns on who the escrow names.
    return reject(owed === 'pokter' ? 'pokter-owed' : 'agent-undelivered');
  }
  if (submitter === 'pokter-courier') return reject('pokter-courier');
  if (submitter === 'unknown') return reject('unknown-submitter');
  if (job.status !== 'COMPLETED') {
    return { counts: false, deliveredUnsettled: true, submitter, owed, exclusion: null };
  }
  return { counts: true, deliveredUnsettled: false, submitter, owed, exclusion: null };
}

export interface OutcomeRow {
  agent: BoardAgent;
  /** Whether the agent is in Pokter's current listing, or only in the job index. */
  listed: boolean;
  /** The `settled-jobs` metric. */
  settledJobs: number;
  /** The `external-buyers` metric. */
  externalBuyers: number;
  /** The `repeat-buyers` metric. */
  repeatBuyers: number;
  /**
   * Delivered by the agent, externally funded, escrow not yet released.
   *
   * Its own number and its own column. Added to `settledJobs` it would claim
   * money has moved when it has not, which is the single thing a
   * buyer-discovery board must not get wrong.
   */
  deliveredUnsettled: number;
  /**
   * Externally funded and settled, but Pokter's courier submitted the
   * delivery with no answer of the agent's in it.
   *
   * Published beside the row rather than dropped: the buyer was served and
   * the escrow released, which is worth knowing. It is simply not evidence
   * that this agent can deliver, so it never enters `settledJobs`.
   */
  courierSettled: number;
  /**
   * Buyer wallets on this row that are themselves the registered owner of a
   * listed agent.
   *
   * Not an exclusion, and not called subsidised. `selfHire` only catches
   * buyer == seller, so one operator buying another operator's agent passes
   * every filter above as outside demand — and on this index that includes a
   * reciprocal pair. It may well be genuine demand; a buyer-discovery board
   * has to let the reader see it and decide.
   */
  operatorBuyers: number;
  /**
   * Buyer wallets on this row that also wrote an on-chain attestation about
   * this same agent, or null when the authors could not be read.
   *
   * Null is not zero. An author is read from the transaction that wrote the
   * attestation, and an RPC that did not answer is not evidence that buyer
   * and reviewer are different parties.
   */
  reviewerBuyers: number | null;
  /** The jobs behind each figure, so every number on the row links to a receipt. */
  settled: HiredJob[];
  delivered: HiredJob[];
  courier: HiredJob[];
  /** Newest settlement on this row, for the period a shared card states. */
  lastSettledAt: string | null;
}

export interface OutcomeExclusions {
  unattributed: number;
  teamFunded: number;
  selfHire: number;
  lifecycleDemo: number;
  pokterCourier: number;
  pokterOwed: number;
  unknownSubmitter: number;
  agentUndelivered: number;
}

export interface OutcomeCoverage {
  escrowChainId: number;
  /**
   * Jobs the index holds for this escrow chain, after de-duplication.
   *
   * De-duplicated upstream, never counted from a raw row count: two writers
   * mint different row ids for one job and 13 of 124 rows were duplicates,
   * which made every count built on them about 10% high. See
   * `job-dedupe.ts`; `JobStore.all()` applies it before this sees a row.
   */
  indexedJobs: number;
  /** Of those, the ones that passed every exclusion and settled. */
  qualifyingJobs: number;
  /** Listed agents on this network that the board could rank. */
  listedAgents: number;
  /**
   * Settled qualifying jobs whose agent is not in the current listing.
   *
   * Counted and disclosed rather than dropped. An agent can be de-listed, or
   * missed by the registry's own search, while its receipts stay on chain,
   * and silently omitting its settlements would understate the board.
   */
  unlistedAgentRows: number;
  /** The newest chain re-read across those jobs: when these standings last refreshed. */
  lastRefreshedAt: string | null;
  exclusions: OutcomeExclusions;
}

export interface OutcomeBoard {
  escrowChainId: number;
  metric: OutcomeMetric;
  rows: OutcomeRow[];
  /**
   * Externally funded jobs the escrow names Pokter as provider for and that
   * were never delivered.
   *
   * Carried on the board rather than on an agent's row because the agent was
   * never named in them. Shown, because a buyer-discovery page that hides
   * the platform's own misses while publishing agents' is not honest.
   */
  platformOwed: HiredJob[];
  coverage: OutcomeCoverage;
}

/** The identity a job was indexed against: registry chain and token, not the escrow. */
export function jobAgentKey(job: HiredJob): string {
  return `${job.agentChainId ?? job.chainId}:${job.agentTokenId}`;
}

function lowered(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value.toLowerCase() : null;
}

/**
 * Order by the one named metric, then alphabetically.
 *
 * The tie-break is deliberately not a second metric. Reaching for buyer
 * count to separate two agents on equal settlements is how a board acquires
 * a composite order its column header no longer explains. A name is not a
 * claim about merit, so a reader who sees two equal figures can tell that
 * Pokter is not asserting one is better than the other.
 */
export function sortOutcomeRows(rows: readonly OutcomeRow[], metric: OutcomeMetric): OutcomeRow[] {
  const value = (row: OutcomeRow): number =>
    metric === 'external-buyers'
      ? row.externalBuyers
      : metric === 'repeat-buyers'
        ? row.repeatBuyers
        : row.settledJobs;
  return [...rows].sort((a, b) => value(b) - value(a) || a.agent.name.localeCompare(b.agent.name));
}

/**
 * Build one network's outcomes board from the indexed jobs.
 *
 * Nothing here is hardcoded and there is no empty-state branch: a network
 * with no qualifying settlement produces `rows: []` because every job was
 * excluded by a named rule, and the coverage block says how many were read
 * and why each was left out. That is what makes the empty case checkable
 * rather than asserted — and mainnet is that case today, with every indexed
 * job on it funded by Pokter's own wallets.
 */
export function buildOutcomeBoard(
  jobs: readonly HiredJob[],
  {
    escrowChainId,
    metric,
    agents,
    listedOwners,
    reviewerAuthors,
    tests,
  }: {
    escrowChainId: number;
    metric: OutcomeMetric;
    /** The listing, by `chainId:tokenId`. An agent absent from it still gets a row. */
    agents: ReadonlyMap<string, BoardAgent>;
    /** Lower-cased owner addresses across the whole listing, both registry chains. */
    listedOwners: ReadonlySet<string>;
    /**
     * Lower-cased attestation authors per agent key, or absent when the
     * authors for that agent were not read. An absent entry yields a null
     * `reviewerBuyers`, never a zero.
     */
    reviewerAuthors: ReadonlyMap<string, ReadonlySet<string>>;
    tests: OutcomeTests;
  },
): OutcomeBoard {
  const onChain = jobs.filter((job) => job.chainId === escrowChainId);
  const exclusions: OutcomeExclusions = {
    unattributed: 0,
    teamFunded: 0,
    selfHire: 0,
    lifecycleDemo: 0,
    pokterCourier: 0,
    pokterOwed: 0,
    unknownSubmitter: 0,
    agentUndelivered: 0,
  };
  const EXCLUSION_FIELD: Record<OutcomeExclusion, keyof OutcomeExclusions> = {
    unattributed: 'unattributed',
    'team-funded': 'teamFunded',
    'self-hire': 'selfHire',
    'lifecycle-demo': 'lifecycleDemo',
    'pokter-courier': 'pokterCourier',
    'pokter-owed': 'pokterOwed',
    'unknown-submitter': 'unknownSubmitter',
    'agent-undelivered': 'agentUndelivered',
  };

  interface Bucket {
    settled: HiredJob[];
    delivered: HiredJob[];
    courier: HiredJob[];
    /** Settled jobs per lower-cased buyer wallet, for the repeat count. */
    buyers: Map<string, number>;
  }
  const buckets = new Map<string, Bucket>();
  const bucketFor = (key: string): Bucket => {
    const held = buckets.get(key);
    if (held) return held;
    const made: Bucket = { settled: [], delivered: [], courier: [], buyers: new Map() };
    buckets.set(key, made);
    return made;
  };

  const platformOwed: HiredJob[] = [];
  let lastRefreshedAt: string | null = null;
  for (const job of onChain) {
    if (!lastRefreshedAt || job.statusCheckedAt > lastRefreshedAt) lastRefreshedAt = job.statusCheckedAt;
    const verdict = judgeJob(job, tests);
    if (verdict.exclusion) {
      exclusions[EXCLUSION_FIELD[verdict.exclusion]] += 1;
      /*
       * A courier settlement is still carried on the agent's row, because
       * leaving it out entirely would make a served buyer invisible. It is
       * counted as an exclusion *and* carried, the same shape
       * `operatorDelivered` keeps in `economic-history.ts`.
       */
      if (verdict.exclusion === 'pokter-courier' && job.status === 'COMPLETED' && isAttributed(job)) {
        bucketFor(jobAgentKey(job)).courier.push(job);
      }
      if (verdict.exclusion === 'pokter-owed') platformOwed.push(job);
      continue;
    }
    const bucket = bucketFor(jobAgentKey(job));
    if (verdict.deliveredUnsettled) {
      bucket.delivered.push(job);
      continue;
    }
    bucket.settled.push(job);
    const buyer = lowered(job.client);
    /*
     * A settled job with no recorded funder cannot reach here:
     * `fundedByTeam` classifies a missing funder as the team's, which is the
     * conservative direction and keeps an unattributable job out of a buyer
     * count rather than inventing a wallet for it.
     */
    if (buyer) bucket.buyers.set(buyer, (bucket.buyers.get(buyer) ?? 0) + 1);
  }

  const rows: OutcomeRow[] = [];
  let unlistedAgentRows = 0;
  let qualifyingJobs = 0;
  for (const [key, bucket] of buckets) {
    const listed = agents.get(key);
    if (!listed && bucket.settled.length > 0) unlistedAgentRows += 1;
    qualifyingJobs += bucket.settled.length;
    const [chainPart, tokenPart] = key.split(':');
    /*
     * A name from the listing, or the one the job recorded. The job's name is
     * a fallback and not a preference: legacy rows carry Pokter's own seller
     * label ("Verified testnet seller") whichever agent was hired, so a label
     * is refused and the token id used instead — the rule the proof page
     * applies, for the same reason.
     */
    const recorded = bucket.settled[0] ?? bucket.delivered[0] ?? bucket.courier[0];
    const fallbackName =
      recorded && recorded.agentName && !/^verified testnet seller$/i.test(recorded.agentName)
        ? recorded.agentName
        : `Agent #${tokenPart}`;
    const agent: BoardAgent = listed ?? {
      key,
      chainId: Number(chainPart),
      tokenId: tokenPart,
      name: fallbackName,
      imageUrl: null,
      category: 'unclassified',
      owner: null,
    };
    const buyerWallets = [...bucket.buyers.keys()];
    const authors = reviewerAuthors.get(key);
    rows.push({
      agent,
      listed: Boolean(listed),
      settledJobs: bucket.settled.length,
      externalBuyers: bucket.buyers.size,
      repeatBuyers: [...bucket.buyers.values()].filter((count) => count > 1).length,
      deliveredUnsettled: bucket.delivered.length,
      courierSettled: bucket.courier.length,
      operatorBuyers: buyerWallets.filter((wallet) => listedOwners.has(wallet)).length,
      reviewerBuyers: authors ? buyerWallets.filter((wallet) => authors.has(wallet)).length : null,
      settled: bucket.settled,
      delivered: bucket.delivered,
      courier: bucket.courier,
      lastSettledAt:
        bucket.settled.map((job) => job.statusCheckedAt).sort((a, b) => b.localeCompare(a))[0] ?? null,
    });
  }

  return {
    escrowChainId,
    metric,
    rows: sortOutcomeRows(rows, metric),
    platformOwed,
    coverage: {
      escrowChainId,
      indexedJobs: onChain.length,
      qualifyingJobs,
      listedAgents: agents.size,
      unlistedAgentRows,
      lastRefreshedAt,
      exclusions,
    },
  };
}
