import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { ALTANA_NETWORK } from '@/lib/altana/client';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { STALE_AFTER_DAYS, daysSinceLastAnswer, stripCells, type StripCell } from '@/lib/history/strip';
import { paidHireChain } from '@/lib/network/escrow';
import type { Verdict } from '@/lib/proof/engine';
import { offersDirectHire, verdictFor, type SearchableAgent } from '@/lib/search/match';
import { catalogueSuggestion, suggestionsByCategory, type Suggestion } from '@/lib/find/suggested';
import { deriveMaturity, type AgentMaturity } from '@/lib/agents/maturity';

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
  /**
   * Where a **paid** hire of this agent would be funded.
   *
   * Not `chainId`, which is the registry the identity lives in. A buyer
   * filtering the catalogue by "Registered on: BNB Chain" and reading a
   * price has no way to tell that an agent settles in testnet $U, because
   * its signed price names the testnet token — the two chains differ for
   * much of the catalogue, and the card said nothing.
   *
   * Null unless Pokter has a verified, payable quote. It used to fall back
   * to testnet, which printed "Test tokens · BNB Testnet" on 58 of 77
   * mainnet-registered agents — none of which had priced in testnet
   * currency. They had no price Pokter could read, which is not the same
   * fact and not this field's to guess. See `paidHireChain`.
   */
  hireChainId: number | null;
  /**
   * Why there is no signed price, as far as the catalogue can honestly
   * tell: `none` when nothing has answered, `unverified` when the agent
   * does answer Pokter's checks but no price it returned could be
   * accepted. The specific refusal — no negotiate skill, wrong signer,
   * terms not covered — is named on the agent's own page, which is the
   * only place that reads the sweep's failure code.
   */
  priceState: 'signed' | 'unverified' | 'none';
  /** The last price the agent signed, in $U, or null when it never has. */
  priceU: number | null;
  priceLabel: string;
  /**
   * What to put in the budget box when the agent has never signed a price.
   * Never a quote: see `suggestionsByCategory`. Null only when the agent has
   * a signed price, where a suggestion would be noise beside the real thing.
   */
  suggested: Suggestion | null;
  /** Whether that signature is still inside its validity window. */
  priceFresh: boolean;
  hirable: boolean;
  deliveredByPokter: boolean;
  paid: { jobs: number; completed: number; delivered: number; missed: number };
  maturity: AgentMaturity;
  owner: string;
}

export function toFindRow(
  entry: SearchableAgent,
  now = Date.now(),
  suggested: Suggestion | null = null,
): FindRow {
  const { listing, record, history } = entry;
  const { agent } = listing;
  const meta = CATEGORY_BY_ID.get(listing.category);
  const today = record.windows.find((window) => window.label === '24h');
  const month = record.windows.find((window) => window.label === '30d');
  const quote = listing.quote;
  const priceU = quote ? Number(quote.priceU) : null;
  const priceFresh = quote != null && !(quote.expiresAt && Date.parse(quote.expiresAt) <= now);
  const hirable = offersDirectHire(entry);
  const maturity = deriveMaturity({
    registered: true,
    reachable: record.totalAnswered > 0,
    // Priced means a signed price an escrow can pay, not merely no unpayable one.
    compatible: record.totalAnswered > 0 && listing.quote != null && listing.quotePayable === true,
    tested: entry.tested === true,
    hired: (history?.jobs ?? 0) > 0,
    delivered: (history?.selfDelivered ?? 0) > 0,
    deliveredByOperator: (history?.operatorDelivered ?? 0) > 0,
    outsideTeam: history?.outsideTeam ?? { jobs: 0, completed: 0, terminal: 0, uniqueBuyers: 0, completionRate: null },
    probeRate: record.totalProbes > 0 ? record.totalAnswered / record.totalProbes : null,
    observedDays: record.observedDays,
  });
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
    hireChainId: paidHireChain({ quoteCurrency: quote?.currency, payable: listing.quotePayable }),
    priceState: priceU !== null ? 'signed' : record.totalAnswered > 0 ? 'unverified' : 'none',
    priceU,
    priceLabel: priceU !== null ? formatQuotedPrice(priceU) : 'You set the budget',
    suggested: priceU !== null ? null : suggested,
    priceFresh,
    hirable,
    deliveredByPokter: agent.chain_id !== ALTANA_NETWORK.chainId,
    paid: { jobs: history?.jobs ?? 0, completed: history?.completed ?? 0, delivered: history?.delivered ?? 0, missed: history?.missed ?? 0 },
    maturity,
    owner: agent.owner_address.toLowerCase(),
  };
}

/** The whole index as rows, stamped with one clock so every strip ends on the same day. */
export function findRows(entries: SearchableAgent[]): FindRow[] {
  const now = Date.now();
  const byCategory = suggestionsByCategory(
    entries.flatMap((entry) =>
      entry.listing.quote
        ? [{ category: entry.listing.category, priceU: Number(entry.listing.quote.priceU) }]
        : [],
    ),
  );
  const fallback = catalogueSuggestion(byCategory);
  return entries.map((entry) =>
    toFindRow(entry, now, byCategory.get(entry.listing.category) ?? fallback),
  );
}

export { STALE_AFTER_DAYS };
