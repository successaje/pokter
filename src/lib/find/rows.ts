import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { ALTANA_NETWORK } from '@/lib/altana/client';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { STALE_AFTER_DAYS, daysSinceLastAnswer, stripCells, type StripCell } from '@/lib/history/strip';
import type { Verdict } from '@/lib/proof/engine';
import { offersDirectHire, verdictFor, type SearchableAgent } from '@/lib/search/match';

/**
 * One agent as the Find list needs it: every field already a string or a
 * number, so the whole list can cross to the client once and be filtered,
 * sorted, selected and compared there without another request.
 */
export interface FindRow {
  key: string;
  chainId: number;
  tokenId: string;
  name: string;
  imageUrl: string | null;
  category: Category | 'unclassified';
  categoryLabel: string;
  description: string;
  verdict: Verdict;
  /** 0..1 over everything measured, or null when never called. */
  rate: number | null;
  probes: number;
  cells: StripCell[];
  medianMs: number | null;
  /** Days since the last answered check; null when never answered. */
  sinceAnswer: number | null;
  answeringToday: boolean;
  /** The last price the agent signed, in $U, or null when it never has. */
  priceU: number | null;
  priceLabel: string;
  /** Whether that signature is still inside its validity window. */
  priceFresh: boolean;
  hirable: boolean;
  deliveredByPokter: boolean;
  paid: { jobs: number; completed: number };
  owner: string;
}

export function toFindRow(entry: SearchableAgent, now = Date.now()): FindRow {
  const { listing, record, history } = entry;
  const { agent } = listing;
  const meta = CATEGORY_BY_ID.get(listing.category);
  const today = record.windows.find((window) => window.label === '24h');
  const month = record.windows.find((window) => window.label === '30d');
  const quote = listing.quote;
  const priceU = quote ? Number(quote.priceU) : null;
  const priceFresh = quote != null && !(quote.expiresAt && Date.parse(quote.expiresAt) <= now);
  return {
    key: `${agent.chain_id}:${agent.token_id}`,
    chainId: agent.chain_id,
    tokenId: agent.token_id,
    name: agent.name,
    imageUrl: agent.image_url ?? null,
    category: listing.category,
    categoryLabel: meta?.label ?? 'Unclassified',
    description: (agent.description ?? '').replace(/https?:\/\/\S+/g, '').replace(/\s{2,}/g, ' ').trim(),
    verdict: verdictFor(entry),
    rate: record.totalProbes > 0 ? record.totalAnswered / record.totalProbes : null,
    probes: record.totalProbes,
    cells: stripCells(record, 14, now),
    medianMs: month?.medianMs ?? null,
    sinceAnswer: daysSinceLastAnswer(record, now),
    answeringToday: Boolean(today && today.probes > 0 && (today.ratio ?? 0) > 0),
    priceU,
    priceLabel: priceU !== null ? formatQuotedPrice(priceU) : 'You set the budget',
    priceFresh,
    hirable: offersDirectHire(entry),
    deliveredByPokter: agent.chain_id !== ALTANA_NETWORK.chainId,
    paid: { jobs: history?.jobs ?? 0, completed: history?.completed ?? 0 },
    owner: agent.owner_address.toLowerCase(),
  };
}

/** The whole index as rows, stamped with one clock so every strip ends on the same day. */
export function findRows(entries: SearchableAgent[]): FindRow[] {
  const now = Date.now();
  return entries.map((entry) => toFindRow(entry, now));
}

export { STALE_AFTER_DAYS };
