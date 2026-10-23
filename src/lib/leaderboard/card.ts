import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { chainLabel, escrowMoney } from '@/lib/network/presentation';

import type { BoardNetwork } from './network';
import { escrowChainOf } from './network';
import { OUTCOME_METRIC_BY_ID, type OutcomeMetric, type OutcomeRow } from './outcomes';

/**
 * What a builder's shared card states, and nothing more.
 *
 * Three facts, because a card that carries a slogan instead of a measurement
 * is the thing `lib/og/card.tsx` exists to prevent. The metric is named in
 * full rather than abbreviated to a rank, so a card cannot circulate saying
 * "#1 on Pokter" with no statement of what it was first at — the shareable
 * artefact has to carry its own denominator, because it will be read far
 * from the page that produced it.
 *
 * The period is stated as the index's own horizon rather than a rolling
 * window: the outcomes board counts every indexed job up to the last time
 * Pokter re-read chain state, and saying "last 30 days" would be false.
 */
export interface LeaderboardCard {
  agentName: string;
  /** `chainId:tokenId`, so the card names the exact registration. */
  agentKey: string;
  /** The metric's column header, verbatim. */
  metric: string;
  /** The same header split for a card's fact column. See `OutcomeMetricMeta`. */
  metricShort: string;
  metricQualifier: string;
  /** The figure that metric produced, already formatted. */
  value: string;
  /** The category the comparison was made inside, or that none was declared. */
  category: string;
  /** The period the figure covers, with the network it covers it on. */
  period: string;
  /** The same period split for a card's fact column: the horizon, then the network. */
  periodValue: string;
  periodNote: string;
  /** One sentence on what the figure does and does not establish. */
  lede: string;
}

function valueFor(row: OutcomeRow, metric: OutcomeMetric): number {
  return metric === 'external-buyers'
    ? row.externalBuyers
    : metric === 'repeat-buyers'
      ? row.repeatBuyers
      : row.settledJobs;
}

function period(
  network: BoardNetwork,
  lastRefreshedAt: string | null,
): { line: string; value: string; note: string } {
  const chain = chainLabel(escrowChainOf(network));
  const parsed = lastRefreshedAt === null ? Number.NaN : Date.parse(lastRefreshedAt);
  /*
   * An unreadable or missing refresh time becomes "to date", not today's
   * date. Stamping the card with the moment it was rendered would imply
   * Pokter had re-read chain state then, which is the one thing this field
   * is supposed to tell the reader.
   */
  const horizon = Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
  return {
    line: horizon ? `Indexed jobs on ${chain} through ${horizon}` : `Indexed jobs on ${chain}, to date`,
    value: horizon ?? 'To date',
    note: `all indexed jobs on ${chain}`,
  };
}

export function leaderboardCard(
  row: OutcomeRow,
  {
    network,
    metric,
    lastRefreshedAt,
  }: { network: BoardNetwork; metric: OutcomeMetric; lastRefreshedAt: string | null },
): LeaderboardCard {
  const meta = OUTCOME_METRIC_BY_ID.get(metric)!;
  const money = escrowMoney(escrowChainOf(network));
  const window = period(network, lastRefreshedAt);
  /* An unclassified agent says so rather than borrowing a category it is
     not listed in; the comparison was never made inside one. */
  const category =
    row.agent.category === 'unclassified' ? null : CATEGORY_BY_ID.get(row.agent.category);
  return {
    agentName: row.agent.name,
    agentKey: row.agent.key,
    metric: meta.column,
    metricShort: meta.short,
    metricQualifier: meta.qualifier,
    value: valueFor(row, metric).toLocaleString('en-US'),
    category: category?.label ?? 'No category declared',
    period: window.line,
    periodValue: window.value,
    periodNote: window.note,
    /*
     * The money note is carried onto the card deliberately. A testnet figure
     * shared without it reads as paid work, and this card is the surface most
     * likely to be seen by someone who never visits the board.
     */
    lede: `${money.real === false ? 'Settled in test tokens with no real value. ' : ''}Counts escrow settlements with evidence the agent delivered; it does not establish that any answer was correct or profitable.`,
  };
}
