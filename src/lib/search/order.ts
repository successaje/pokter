import { offersDirectHire, type SearchableAgent } from './match';

export type MarketplaceOrder = 'recommended' | 'responsive' | 'evidence' | 'price';

export const MARKETPLACE_ORDERS: Array<{ value: MarketplaceOrder; label: string }> = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'responsive', label: 'Recently responsive' },
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

function evidence(agent: SearchableAgent) {
  return agent.record.totalProbes + agent.listing.attestationCount * 25;
}

/** Stable, explainable ordering based only on marketplace-observed fields. */
export function orderMarketplace(entries: SearchableAgent[], order: MarketplaceOrder) {
  return entries.map((entry, index) => ({ entry, index })).sort((a, b) => {
    let difference = 0;
    if (order === 'responsive') difference = recent(b.entry) - recent(a.entry);
    if (order === 'evidence') difference = evidence(b.entry) - evidence(a.entry);
    if (order === 'price') {
      const aPrice = currentPrice(a.entry);
      const bPrice = currentPrice(b.entry);
      difference = aPrice === null ? 1 : bPrice === null ? -1 : aPrice - bPrice;
    }
    if (order === 'recommended') {
      difference = Number(offersDirectHire(b.entry)) - Number(offersDirectHire(a.entry));
      if (!difference) difference = recent(b.entry) - recent(a.entry);
      if (!difference) difference = Number(currentPrice(b.entry) !== null) - Number(currentPrice(a.entry) !== null);
      if (!difference) difference = evidence(b.entry) - evidence(a.entry);
    }
    return difference || a.index - b.index;
  }).map(({ entry }) => entry);
}

