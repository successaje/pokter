import 'server-only';

import { CATEGORIES, type Category } from '@/lib/agents/categories';
import { isPromotableAgent } from '@/lib/agents/eligibility';
import { summarizeMarketplaceActivity } from '@/lib/erc8183/activity-stats';
import { getJobStore } from '@/lib/erc8183/store';
import { findRows, type FindRow } from '@/lib/find/rows';
import { getEcosystemStats, listSearchableWithStatus, type EcosystemStats } from '@/lib/marketplace';
import { outcomeShortlist } from '@/lib/home/outcome-shortlist';
import { chainLabel } from '@/lib/network/presentation';
import { offersDirectHire, type SearchableAgent } from '@/lib/search/match';
import { mostReliable } from '@/lib/search/order';
import { operatorResolver } from '@/lib/funding/operator';
import { getFunderStore } from '@/lib/funding/store';
import { teamWalletSet } from '@/lib/team/server';
import { fundedByTeam } from '@/lib/team/wallets';

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
      label: 'Signed price',
      result: row.priceU !== null ? `${row.priceLabel}, signed by its wallet` : 'Has not signed a price',
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
      : row.hirable && row.paid.completed > 0
        ? 'Answers, names its price and has delivered paid work. Hireable.'
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
  const pairs = entries.map((entry, index) => ({ entry, row: rows[index] })).filter(({ entry }) => isPromotableAgent(entry.listing.agent) && (entry.listing.agent.description ?? '').length > 40);
  const strong =
    pairs.find(({ row }) => row.hirable && row.paid.completed > 0 && row.priceU !== null) ??
    pairs.find(({ row }) => row.hirable && row.priceU !== null) ??
    pairs.find(({ row }) => row.hirable);
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
  /** The most reliable agents this week, one per operator, with this week's figures. */
  reliable: Array<{ row: FindRow; probes: number; answered: number; medianMs: number | null }>;
  /**
   * Jobs outside buyers funded; Pokter's own test hires are counted apart in
   * `teamCompleted`. `completedMainnet` is the part paid in real $U.
   */
  activity: { completedJobs: number; completedMainnet: number; teamCompleted: number; indexedJobs: number; activeJobs: number };
  measured: { monitored: number; answering: number };
  /** The same counts Discover's collections show, so the two never disagree. */
  catalogue: { hireable: number; priced: number };
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
    .filter((entry) => isPromotableAgent(entry.listing.agent))
    .map((entry) => byKey.get(`${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`)!)
    .filter((row) => row.hirable)
    .sort((a, b) => b.paid.completed - a.paid.completed || Number(b.priceU !== null) - Number(a.priceU !== null) || (b.rate ?? 0) - (a.rate ?? 0));
  const owners = new Set<string>();
  const featured = hireable.filter((row) => (owners.has(row.owner) ? false : (owners.add(row.owner), true))).slice(0, 4);

  const outcomes = CATEGORIES.map((category) => {
    const top = outcomeShortlist(entries, category.id, 3).map((entry) => byKey.get(`${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`)!);
    return {
      id: category.id,
      label: category.label,
      count: entries.filter((entry) => entry.listing.category === category.id).length,
      top,
    };
  });

  // Owners first funded from the same wallet count as one operator. Only
  // mainnet owners have a funder on record; the rest stand alone.
  const ownerWallets = entries.map((entry) => entry.listing.agent.owner_address);
  const operatorOf = operatorResolver(ownerWallets, getFunderStore().funders(ownerWallets));
  const reliable = mostReliable(entries.filter((entry) => isPromotableAgent(entry.listing.agent)), 5, operatorOf).map((entry) => {
    const week = entry.record.windows.find((window) => window.label === '7d');
    return {
      row: byKey.get(`${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`)!,
      probes: week?.probes ?? 0,
      answered: week?.answered ?? 0,
      medianMs: week?.medianMs ?? null,
    };
  });

  const team = teamWalletSet();
  const allJobs = getJobStore().all();
  const buyerJobs = allJobs.filter((job) => !fundedByTeam(job, team));
  const jobs = summarizeMarketplaceActivity(buyerJobs);
  const mainnetJobs = summarizeMarketplaceActivity(buyerJobs.filter((job) => job.chainId === 56));
  const teamJobs = summarizeMarketplaceActivity(allJobs.filter((job) => fundedByTeam(job, team)));
  const promotable = entries.filter((entry) => isPromotableAgent(entry.listing.agent));

  return {
    reachable: !unreachable,
    stats,
    specimens: chooseSpecimens(entries, rows),
    featured,
    outcomes,
    reliable,
    activity: { completedJobs: jobs.completedJobs, completedMainnet: mainnetJobs.completedJobs, teamCompleted: teamJobs.completedJobs, indexedJobs: jobs.indexedJobs, activeJobs: jobs.activeJobs },
    measured: { monitored: stats?.agentsMonitored ?? 0, answering: stats?.agentsAnswering ?? 0 },
    catalogue: {
      hireable: promotable.filter((entry) => offersDirectHire(entry)).length,
      priced: promotable.filter((entry) => entry.listing.quote != null).length,
    },
  };
}
