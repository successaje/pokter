import { offersDirectHire, type SearchableAgent } from './match';

export type MarketplaceOrder =
  | 'recommended'
  | 'reliable'
  | 'responsive'
  | 'completed'
  | 'evidence'
  | 'price';

export const MARKETPLACE_ORDERS: Array<{ value: MarketplaceOrder; label: string }> = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'reliable', label: 'Most reliable this week' },
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

/**
 * Probes an agent needs in the last seven days before it is ranked on
 * reliability. Pokter probes every two hours, so twenty is about two and a
 * half days of watching: enough that one lucky answer cannot top the list.
 */
export const RELIABLE_MIN_PROBES = 20;

/**
 * Reliability this week, as the lower bound of a 95% Wilson interval on the
 * share of probes answered.
 *
 * A plain percentage ties every agent that answered everything, and would
 * rank 3 of 3 level with 62 of 62. The lower bound asks how high the rate
 * can be said to be with confidence, so a longer clean record ranks above a
 * shorter one. Null below the minimum sample: unranked, not ranked low.
 */
export function reliabilityScore(agent: SearchableAgent): number | null {
  const week = agent.record.windows.find((window) => window.label === '7d');
  if (!week || week.probes < RELIABLE_MIN_PROBES) return null;
  const n = week.probes;
  const p = week.answered / n;
  const z = 1.96;
  const denominator = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return (centre - margin) / denominator;
}

function weekMedianMs(agent: SearchableAgent): number | null {
  return agent.record.windows.find((window) => window.label === '7d')?.medianMs ?? null;
}

/**
 * Lets funded work lapse more often than it delivers it.
 *
 * Answering probes and delivering paid work are different promises, and an
 * agent that keeps the first while breaking the second is not reliable in
 * the sense a buyer means. Missed covers jobs still FUNDED past their
 * deadline as well as EXPIRED ones (see economic-history).
 */
export function letsJobsLapse(agent: SearchableAgent): boolean {
  const missed = agent.history?.missed ?? 0;
  return missed > 0 && missed > (agent.history?.delivered ?? 0);
}

/**
 * Agents that let jobs lapse go after every agent that does not. Among the
 * rest: reliable first, then faster, then proven by paid work. Agents without
 * enough probes this week keep their relative order after every ranked one.
 */
function compareReliability(a: SearchableAgent, b: SearchableAgent): number {
  const scoreA = reliabilityScore(a);
  const scoreB = reliabilityScore(b);
  if (scoreA === null || scoreB === null) return scoreA === null ? (scoreB === null ? 0 : 1) : -1;
  const lapseA = letsJobsLapse(a);
  const lapseB = letsJobsLapse(b);
  if (lapseA !== lapseB) return lapseA ? 1 : -1;
  if (Math.abs(scoreB - scoreA) > 1e-9) return scoreB - scoreA;
  const msA = weekMedianMs(a);
  const msB = weekMedianMs(b);
  if (msA !== msB) return msA === null ? 1 : msB === null ? -1 : msA - msB;
  return completedWork(b) - completedWork(a);
}

/**
 * The most reliable agents this week, one per operator.
 *
 * `operatorOf` says who runs an owner wallet. By default each wallet is its
 * own operator; the home strip passes one that groups wallets by their first
 * funder (see lib/funding/operator).
 */
export function mostReliable(
  entries: SearchableAgent[],
  limit: number,
  operatorOf: (owner: string) => string = (owner) => owner.toLowerCase(),
): SearchableAgent[] {
  const operators = new Set<string>();
  return entries
    // A strip called "most reliable" never features an agent that lets
    // paid jobs lapse, however well it answers probes.
    .filter((entry) => reliabilityScore(entry) !== null && !letsJobsLapse(entry))
    .sort(compareReliability)
    .filter((entry) => {
      const operator = operatorOf(entry.listing.agent.owner_address);
      if (operators.has(operator)) return false;
      operators.add(operator);
      return true;
    })
    .slice(0, limit);
}

/** Stable, explainable ordering based only on marketplace-observed fields. */
export function orderMarketplace(entries: SearchableAgent[], order: MarketplaceOrder) {
  return entries.map((entry, index) => ({ entry, index })).sort((a, b) => {
    let difference = 0;
    if (order === 'reliable') difference = compareReliability(a.entry, b.entry);
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

