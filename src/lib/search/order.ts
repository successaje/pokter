import { offersDirectHire, type SearchableAgent } from './match';

export type MarketplaceOrder =
  | 'recommended'
  | 'responsive'
  | 'completed'
  | 'evidence'
  | 'price';

export const MARKETPLACE_ORDERS: Array<{ value: MarketplaceOrder; label: string }> = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'responsive', label: 'Recently responsive' },
  { value: 'completed', label: 'Most work completed' },
  { value: 'evidence', label: 'Most evidence' },
  { value: 'price', label: 'Lowest signed price' },
];

export function parseMarketplaceOrder(value: unknown): MarketplaceOrder {
  return MARKETPLACE_ORDERS.some((option) => option.value === value)
    ? value as MarketplaceOrder
    : 'recommended';
}

function recent(agent: SearchableAgent) {
  const window = agent.record.windows.find((entry) => entry.label === '24h');
  return window && window.probes > 0 ? window.ratio ?? 0 : -1;
}

function currentPrice(agent: SearchableAgent): number | null {
  const quote = agent.listing.quote;
  if (!quote || (quote.expiresAt && Date.parse(quote.expiresAt) <= Date.now())) return null;
  return Number(quote.priceU);
}

/**
 * Work finished, not work taken on.
 *
 * Counting funded jobs would rank the busiest agent first, and the busiest
 * agent here has seven escrows funded against it and one completion — so
 * "most active" would have promoted the one that mostly does not deliver,
 * directly above a card saying so. Taking a job is not evidence of anything;
 * finishing one is the only activity a buyer benefits from.
 *
 * Absent history sorts as zero rather than being excluded. An agent nobody
 * has hired has completed nothing, which is true, and it still ranks on
 * responsiveness and evidence like everything else.
 */
function completedWork(agent: SearchableAgent) {
  return agent.history?.completed ?? 0;
}

function evidence(agent: SearchableAgent) {
  return agent.record.totalProbes + agent.listing.attestationCount * 25;
}

/** Stable, explainable ordering based only on marketplace-observed fields. */
export function orderMarketplace(entries: SearchableAgent[], order: MarketplaceOrder) {
  return entries.map((entry, index) => ({ entry, index })).sort((a, b) => {
    let difference = 0;
    if (order === 'responsive') difference = recent(b.entry) - recent(a.entry);
    if (order === 'completed') difference = completedWork(b.entry) - completedWork(a.entry);
    if (order === 'evidence') difference = evidence(b.entry) - evidence(a.entry);
    if (order === 'price') {
      const aPrice = currentPrice(a.entry);
      const bPrice = currentPrice(b.entry);
      difference = aPrice === null ? 1 : bPrice === null ? -1 : aPrice - bPrice;
    }
    if (order === 'recommended') {
      difference = Number(offersDirectHire(b.entry)) - Number(offersDirectHire(a.entry));
      if (!difference) difference = recent(b.entry) - recent(a.entry);
      /*
       * Delivery outranks having a price. An agent that has finished paid
       * work has shown the one thing a marketplace exists to produce, and
       * quoting a price only shows willingness to be asked.
       */
      if (!difference) difference = completedWork(b.entry) - completedWork(a.entry);
      if (!difference) difference = Number(currentPrice(b.entry) !== null) - Number(currentPrice(a.entry) !== null);
      if (!difference) difference = evidence(b.entry) - evidence(a.entry);
    }
    return difference || a.index - b.index;
  }).map(({ entry }) => entry);
}

