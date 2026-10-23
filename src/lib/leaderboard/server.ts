import 'server-only';

import { CATEGORIES, type Category } from '@/lib/agents/categories';
import { isLifecycleDemo, isRelayedDelivery } from '@/lib/agent/credited-history';
import { getJobStore } from '@/lib/erc8183/store';
import { isSelfHire } from '@/lib/erc8183/production-proof';
import type { HiredJob } from '@/lib/erc8183/types';
import { listSearchableWithStatus } from '@/lib/marketplace';
import { resolveAttestationAuthors } from '@/lib/proof/attestation-authors';
import { listFeedbacks } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { teamWalletSet } from '@/lib/team/server';
import { fundedByTeam } from '@/lib/team/wallets';

import {
  DATA_UNAVAILABLE,
  escrowChainOf,
  registryChainOf,
  type BoardAgent,
  type BoardNetwork,
  type BoardResult,
} from './network';
import {
  buildOutcomeBoard,
  type OutcomeBoard,
  type OutcomeMetric,
  type OutcomeRow,
  type OutcomeTests,
} from './outcomes';
import {
  buildResponsivenessBoard,
  type ResponsivenessBoard,
  type ResponsivenessInput,
} from './responsiveness';

/**
 * One catalogue read serves both views.
 *
 * `listSearchableWithStatus` is the shared build, cached for
 * `CATALOGUE_FRESH_MS` across requests, and it already joins the probe
 * history and the local job index that both views need. Reading it twice in
 * one render costs nothing, and every visitor inside that minute is served
 * the same build — which is the first half of the consistency claim this
 * page makes.
 *
 * It covers both registry chains, which the outcomes view needs and a
 * single-chain read could not supply: 22 of the indexed jobs settled on the
 * testnet escrow against an agent registered on mainnet, so a testnet board
 * built from testnet registrations alone would drop them.
 */
type Catalogue = Awaited<ReturnType<typeof listSearchableWithStatus>>;
type CatalogueEntry = Catalogue['entries'][number];

function toBoardAgent(entry: CatalogueEntry): BoardAgent {
  const agent = entry.listing.agent;
  return {
    key: `${agent.chain_id}:${agent.token_id}`,
    chainId: agent.chain_id,
    tokenId: agent.token_id,
    name: agent.name,
    imageUrl: agent.image_url ?? null,
    category: entry.listing.category,
    owner: typeof agent.owner_address === 'string' ? agent.owner_address.toLowerCase() : null,
  };
}

/**
 * The exclusion rules, bound to the live stores.
 *
 * `teamWalletSet` rather than `teamAddressSet`: the operator key's address is
 * derived here and is the wallet Pokter's courier actually submits from, so a
 * set without it would read every courier delivery as the agent's own work
 * the day the key is rotated. That is the one substitution this board exists
 * to refuse.
 */
function outcomeTests(): OutcomeTests {
  const team = teamWalletSet();
  return {
    teamFunded: (job) => fundedByTeam(job, team),
    selfHire: isSelfHire,
    lifecycleDemo: isLifecycleDemo,
    relayedDelivery: isRelayedDelivery,
    operatorWallet: (address) => team.has(address),
  };
}

/** How many rows get their attestation authors read. See `reviewerAuthorsFor`. */
const REVIEWER_LOOKUP_ROWS = 10;
/** The whole author lookup's share of a page render. Past it, every row reports "not read". */
const REVIEWER_LOOKUP_BUDGET_MS = 4_000;

function withBudget<T>(work: Promise<T>, fallback: T, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  /* The loser is still a live promise; swallow its rejection so a slow RPC
     cannot surface as an unhandled rejection after the page has rendered. */
  work.catch(() => undefined);
  return Promise.race([work, expiry]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Which buyer wallets on a row also wrote an attestation about that agent.
 *
 * Read only for the rows actually shown, and only for agents the listing says
 * have an attestation at all, because each row costs one indexer page plus
 * one `eth_getTransactionByHash` per attestation. `authorCache` in
 * `attestation-authors.ts` keeps what it resolves for the life of the
 * process, so on a long-running machine this is warm after the first render.
 *
 * An agent missing from the returned map yields `reviewerBuyers: null` on its
 * row, not zero. An RPC that did not answer is not evidence that the buyer
 * and the reviewer are different parties, and this disclosure only means
 * anything if its absence is visible.
 */
async function reviewerAuthorsFor(
  rows: readonly OutcomeRow[],
  entries: ReadonlyMap<string, CatalogueEntry>,
): Promise<Map<string, ReadonlySet<string>>> {
  const considered = rows.slice(0, REVIEWER_LOOKUP_ROWS);
  /*
   * An agent with no attestation needs no lookup and is not "not read": the
   * listing already establishes that no author exists, so no buyer can be
   * one. Recorded as an empty set, which the row renders as nought overlap,
   * because reporting it as unread would invite a reader to suspect a
   * conflict Pokter knows is absent.
   */
  const known = new Map<string, ReadonlySet<string>>(
    considered.flatMap((row) => {
      const entry = entries.get(row.agent.key);
      if (!entry || entry.listing.attestationCount > 0) return [];
      return [[row.agent.key, new Set<string>()] as const];
    }),
  );
  const wanted = considered.flatMap((row) => {
    const entry = entries.get(row.agent.key);
    if (!entry || entry.listing.attestationCount <= 0) return [];
    return [{ key: row.agent.key, entry }];
  });
  if (wanted.length === 0) return known;

  const work = (async () => {
    const resolved = new Map<string, ReadonlySet<string>>(known);
    await Promise.all(
      wanted.map(async ({ key, entry }) => {
        const agent = entry.listing.agent;
        const page = await listFeedbacks({
          chainId: agent.chain_id as ChainId,
          agentId: agent.id,
          limit: 50,
        }).catch(() => null);
        if (!page) return;
        const authors = await resolveAttestationAuthors(
          agent.chain_id,
          agent.owner_address,
          page.items,
        ).catch(() => null);
        if (!authors) return;
        const addresses = new Set<string>();
        for (const author of authors.values()) {
          if (author.address) addresses.add(author.address.toLowerCase());
        }
        resolved.set(key, addresses);
      }),
    );
    return resolved;
  })();

  /* On expiry the rows fall back to what was already known without a lookup,
     so a slow RPC costs the overlap figures and not the zero ones. */
  return withBudget(work, known, REVIEWER_LOOKUP_BUDGET_MS);
}

/**
 * The outcomes board for one network, from the job index.
 *
 * Two passes over the same pure builder. The first produces the standings and
 * therefore tells us which rows are worth an attestation lookup; the second
 * folds the authors in. The builder reads no clock and no environment, so
 * running it twice cannot change a figure.
 */
export async function loadOutcomeBoard(
  network: BoardNetwork,
  metric: OutcomeMetric,
): Promise<BoardResult<OutcomeBoard>> {
  let catalogue: Catalogue;
  let jobs: HiredJob[];
  try {
    catalogue = await listSearchableWithStatus({ limit: 400 });
    jobs = getJobStore().all();
  } catch {
    /* A store or registry that did not answer says so. It never says zero. */
    return { state: 'unavailable', reason: DATA_UNAVAILABLE };
  }
  if (catalogue.unreachable) {
    return { state: 'unavailable', reason: DATA_UNAVAILABLE };
  }

  const escrowChainId = escrowChainOf(network);
  const entries = new Map(catalogue.entries.map((entry) => [`${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`, entry] as const));
  const agents = new Map([...entries].map(([key, entry]) => [key, toBoardAgent(entry)] as const));
  /*
   * Owners from both registry chains. A buyer who runs a mainnet agent and
   * buys on the testnet escrow is exactly the case this disclosure is for,
   * and a one-chain owner set would miss it.
   */
  const listedOwners = new Set(
    [...agents.values()].flatMap((agent) => (agent.owner ? [agent.owner] : [])),
  );
  const tests = outcomeTests();
  const build = (reviewerAuthors: ReadonlyMap<string, ReadonlySet<string>>) =>
    buildOutcomeBoard(jobs, { escrowChainId, metric, agents, listedOwners, reviewerAuthors, tests });

  const first = build(new Map());
  const reviewerAuthors = await reviewerAuthorsFor(first.rows, entries);
  return { state: 'ready', data: reviewerAuthors.size === 0 ? first : build(reviewerAuthors) };
}

/**
 * The responsiveness board for one network, from the probe history.
 *
 * Grouped by category because that is the only population the comparison is
 * made inside. A category whose registry reads all failed is reported as
 * unread rather than rendered empty — `incomplete` carries exactly that, per
 * category and per chain.
 */
export async function loadResponsivenessBoard(
  network: BoardNetwork,
): Promise<BoardResult<ResponsivenessBoard>> {
  let catalogue: Catalogue;
  try {
    catalogue = await listSearchableWithStatus({ limit: 400 });
  } catch {
    return { state: 'unavailable', reason: DATA_UNAVAILABLE };
  }
  if (catalogue.unreachable) {
    return { state: 'unavailable', reason: DATA_UNAVAILABLE };
  }

  const registryChainId = registryChainOf(network);
  const onChain = catalogue.entries.filter((entry) => entry.listing.agent.chain_id === registryChainId);
  const byCategory = CATEGORIES.map(({ id }) => ({
    category: id,
    inputs: onChain
      .filter((entry) => entry.listing.category === id)
      .map<ResponsivenessInput>((entry) => ({
        agent: toBoardAgent(entry),
        /*
         * What the agent declares it speaks, which is how the check chooses
         * what to send. Named as a declaration on the page: the handshake
         * Pokter actually makes is whatever the agent's own card offers.
         */
        protocol: entry.listing.agent.supported_protocols?.[0] ?? null,
        windows: entry.record.windows,
        lastSeen: entry.record.lastSeen,
      })),
  }));
  const unreadCategories: Category[] = catalogue.incomplete
    .filter((gap) => gap.chainId === registryChainId)
    .map((gap) => gap.category);

  return {
    state: 'ready',
    data: buildResponsivenessBoard({ registryChainId, byCategory, unreadCategories }),
  };
}
