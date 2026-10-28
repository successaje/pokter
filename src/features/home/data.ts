import 'server-only';

import { CATEGORIES, type Category } from '@/lib/agents/categories';
import { isFeaturableAgent } from '@/lib/agents/eligibility';
import { mainnetFirstPerAgent } from '@/lib/agents/distinct';
import { summarizeMarketplaceActivity } from '@/lib/erc8183/activity-stats';
import { courierPaidTest } from '@/lib/erc8183/courier-paid';
import { getJobStore } from '@/lib/erc8183/store';
import { findRows, type FindRow } from '@/lib/find/rows';
import { getEcosystemStats, listSearchableWithStatus, type EcosystemStats } from '@/lib/marketplace';
import { outcomeShortlist } from '@/lib/home/outcome-shortlist';
import { chainLabel } from '@/lib/network/presentation';
import { letsJobsLapse, type SearchableAgent } from '@/lib/search/match';
import { catalogueCounts } from '@/lib/agents/catalogue-counts';
import { registeredWalletRead } from '@/lib/registry/live-agent';
import { teamWalletSet } from '@/lib/team/server';
import { fundedByTeam } from '@/lib/team/wallets';
import { isLifecycleDemo } from '@/lib/agent/credited-history';
import { isSelfHire } from '@/lib/erc8183/production-proof';

/** One line of the hero's inspection: a real check with a real result. */
export interface SpecimenCheck {
  id: 'identity' | 'endpoint' | 'price' | 'evidence' | 'work';
  label: string;
  result: string;
  tone: 'ok' | 'watch' | 'bad' | 'none';
}

export interface Specimen {
  key: string;
  href: string;
  name: string;
  claim: string;
  category: string;
  checks: SpecimenCheck[];
  conclusion: string;
  verdict: FindRow['verdict'];
}

function trimClaim(text: string, max = 150) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

function specimenFor(entry: SearchableAgent, row: FindRow): Specimen {
  const attestations = entry.listing.attestationCount;
  const answered = entry.record.totalAnswered;
  const probes = entry.record.totalProbes;
  const checks: SpecimenCheck[] = [
    {
      id: 'identity',
      label: 'Registered identity',
      result: `ERC-8004 #${row.tokenId} · ${chainLabel(row.chainId)}`,
      tone: 'ok',
    },
    {
      id: 'endpoint',
      label: 'Answers when asked',
      result:
        probes === 0
          ? 'Not probed yet'
          : `${answered.toLocaleString('en-US')} of ${probes.toLocaleString('en-US')} probes`,
      tone: probes === 0 ? 'none' : answered === 0 ? 'bad' : answered / probes >= 0.9 ? 'ok' : 'watch',
    },
    {
      id: 'price',
      label: row.priceU !== null && !row.priceFresh ? 'Last signed escrow quote' : 'Escrow quote',
      result: row.priceU !== null ? `${row.priceLabel}, signed by its wallet` : 'Has not signed a quote',
      tone: row.priceU !== null ? 'ok' : 'none',
    },
    {
      id: 'evidence',
      label: 'Published attestations',
      result: attestations > 0 ? `${attestations} published attestation${attestations === 1 ? '' : 's'}` : 'None published',
      tone: attestations > 0 ? 'ok' : 'none',
    },
    {
      id: 'work',
      label: 'Paid work delivered',
      result:
        row.paid.missed > 0
          ? `${row.paid.delivered} delivered, ${row.paid.missed} missed`
          : row.paid.completed > 0
            ? `${row.paid.completed} completed via escrow`
            : row.paid.jobs > 0
              ? `${row.paid.jobs} hired, none completed yet`
              : 'No paid jobs on record',
      tone: row.paid.missed > row.paid.delivered ? 'watch' : row.paid.completed > 0 ? 'ok' : 'none',
    },
  ];

  const conclusion =
    probes > 0 && answered === 0
      ? 'Describes the work well. Has never answered. Not recommended.'
      : row.paid.missed > row.paid.delivered
        ? `Answers, but has missed ${row.paid.missed} of ${row.paid.missed + row.paid.delivered} paid jobs. Not recommended.`
        : row.hirable && row.paid.completed > 0
          ? row.priceU !== null
            ? 'Answers, names its price and has delivered paid work. Hireable.'
            : 'Answers and has delivered paid work. Hireable.'
        : row.hirable
          ? 'Answers and can be hired. Paid delivery not yet on record.'
          : probes === 0
            ? 'Registered, but nothing has been measured yet.'
            : 'Measured, but not offered for direct hire.';

  return {
    key: row.key,
    href: `/agents/${row.chainId}/${row.tokenId}`,
    name: row.name,
    claim: trimClaim(row.description || 'No description published.'),
    category: row.categoryLabel,
    checks,
    conclusion,
    verdict: row.verdict,
  };
}

/**
 * Three real agents chosen to show the range the registry actually holds:
 * one that works, one that only talks, one that has not been looked at.
 * Contrast is the argument; a carousel of three good agents would not make it.
 */
function chooseSpecimens(entries: SearchableAgent[], rows: FindRow[]): Specimen[] {
  const pairs = entries.map((entry, index) => ({ entry, row: rows[index] })).filter(({ entry }) => isFeaturableAgent(entry.listing.agent) && (entry.listing.agent.description ?? '').length > 40);
  // The agent shown as working must not be one that lets paid jobs lapse.
  const working = pairs.filter(({ entry }) => !letsJobsLapse(entry));
  const strong =
    working.find(({ row }) => row.hirable && row.paid.completed > 0 && row.priceU !== null) ??
    working.find(({ row }) => row.hirable && row.priceU !== null) ??
    working.find(({ row }) => row.hirable);
  const silent = pairs.find(({ entry }) => entry.record.totalProbes >= 6 && entry.record.totalAnswered === 0);
  const unpriced = pairs.find(({ row, entry }) => row.priceU === null && entry.record.totalProbes > 0 && entry.record.totalAnswered > 0 && row.key !== strong?.row.key);
  return [strong, silent, unpriced].filter((x): x is NonNullable<typeof x> => Boolean(x)).map(({ entry, row }) => specimenFor(entry, row));
}

export interface HomeData {
  reachable: boolean;
  stats: EcosystemStats | null;
  specimens: Specimen[];
  featured: FindRow[];
  outcomes: Array<{ id: Category; label: string; count: number; top: FindRow[] }>;
  /**
   * Jobs outside buyers funded; Pokter's own test hires are counted apart in
   * `teamCompleted`. `completedMainnet` is the part paid in real $U.
   */
  activity: { completedJobs: number; answeredJobs: number; demoJobs: number; selfHireJobs: number; courierJobs: number; completedMainnet: number; teamCompleted: number; indexedJobs: number; activeJobs: number };
  measured: { monitored: number; answering: number };
  /** The same counts Discover's collections show, so the two never disagree. */
  catalogue: { hireable: number; priced: number; pricedInCategories: number };
}

export async function loadHome(): Promise<HomeData> {
  const [{ entries, unreachable }, stats] = await Promise.all([
    // The same depth as Discover, so the home strip and Discover's
    // "Most reliable" sort rank the same agents.
    listSearchableWithStatus({ limit: 400 }),
    getEcosystemStats().catch(() => null),
  ]);
  const rows = findRows(entries);
  const byKey = new Map(rows.map((row) => [row.key, row]));

  const hireable = entries
    // An endpoint that requires a login cannot take a Pokter hire's task, so
    // it is not featured as hireable now.
    // An agent that lets paid jobs lapse is not featured either, however well
    // it answers probes.
    // Nor one outside the five categories: featuring it would imply Pokter evaluated work it does not evaluate.
    .filter((entry) => isFeaturableAgent(entry.listing.agent) && entry.listing.requiresAuth !== true && !letsJobsLapse(entry) && entry.listing.category !== 'unclassified')
    .map((entry) => byKey.get(`${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`)!)
    .filter((row) => row.hirable)
    // A signed price first: a row reading "No signed price" asks the buyer to
    // guess, and leading with it made the strip look like a list of maybes.
    // Then delivered work, then probe rate.
    .sort((a, b) => Number(b.priceU !== null) - Number(a.priceU !== null) || b.paid.completed - a.paid.completed || (b.rate ?? 0) - (a.rate ?? 0));
  /*
   * One row per agent, its mainnet registration, the rule Discover already
   * uses. Sorting first and grouping after is what keeps both halves of it:
   * an agent is ranked by its best registration — the testnet twin, which
   * holds all the delivery history — and shown as its mainnet one.
   *
   * Without this the strip read "Test tokens · BNB Testnet" on all four
   * cards under a hero saying "Live on BNB Chain Mainnet", because every
   * mainnet listing starts with no completed jobs and lost the sort to its
   * own twin. `distinct.ts` names this failure; only Discover was fixed.
   */
  const { items: oneEach } = mainnetFirstPerAgent(hireable, (row) => ({
    owner_address: row.owner,
    name: row.name,
    chain_id: row.chainId,
    token_id: row.tokenId,
  }));
  const owners = new Set<string>();
  const featured = oneEach.filter((row) => (owners.has(row.owner) ? false : (owners.add(row.owner), true))).slice(0, 4);

  const outcomes = CATEGORIES.map((category) => {
    const top = outcomeShortlist(entries, category.id, 3).map((entry) => byKey.get(`${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`)!);
    return {
      id: category.id,
      label: category.label,
      count: entries.filter((entry) => entry.listing.category === category.id).length,
      top,
    };
  });

  const team = teamWalletSet();
  const allJobs = getJobStore().all();
  const buyerJobs = allJobs.filter((job) => !fundedByTeam(job, team));
  const jobs = summarizeMarketplaceActivity(buyerJobs);
  /*
   * The headline counts answered work by outside buyers only: accepted, the
   * agent's answer delivered, and not a self-hire. Lifecycle demos and
   * self-hires settle like any job, and an outside review read the old
   * figure (13) as useful customer outcomes when the strict count was 7.
   */
  const completedOutside = buyerJobs.filter((job) => job.status === 'COMPLETED');
  const demos = completedOutside.filter((job) => isLifecycleDemo(job)).length;
  const selfHires = completedOutside.filter((job) => !isLifecycleDemo(job) && isSelfHire(job)).length;
  /* The agent's answer, but paid to Pokter's courier: the same rule as Discover and the proof page. */
  const carried = completedOutside.filter((job) => !isLifecycleDemo(job) && !isSelfHire(job));
  const paidToCourier = await courierPaidTest(carried, team, registeredWalletRead);
  const courier = carried.filter(paidToCourier).length;
  const answered = completedOutside.length - demos - selfHires - courier;
  const mainnetJobs = summarizeMarketplaceActivity(buyerJobs.filter((job) => job.chainId === 56));
  const teamJobs = summarizeMarketplaceActivity(allJobs.filter((job) => fundedByTeam(job, team)));

  return {
    reachable: !unreachable,
    stats,
    specimens: chooseSpecimens(entries, rows),
    featured,
    outcomes,
    activity: { completedJobs: jobs.completedJobs, answeredJobs: answered, demoJobs: demos, selfHireJobs: selfHires, courierJobs: courier, completedMainnet: mainnetJobs.completedJobs, teamCompleted: teamJobs.completedJobs, indexedJobs: jobs.indexedJobs, activeJobs: jobs.activeJobs },
    measured: { monitored: stats?.agentsMonitored ?? 0, answering: stats?.agentsAnswering ?? 0 },
    // The same figures Discover and the methodology census show.
    catalogue: catalogueCounts(entries),
  };
}
