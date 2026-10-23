import 'server-only';

import { cache } from 'react';

import { boardNetworkFrom, type BoardNetwork } from './network';
import { outcomeMetricFrom, type OutcomeMetric } from './outcomes';
import { leaderboardCard, type LeaderboardCard } from './card';
import { loadOutcomeBoard } from './server';

/**
 * The card for one agent, read from the board it is a row of.
 *
 * Deliberately built by loading the whole board and finding the row rather
 * than recomputing one agent's figures. A second code path would be a second
 * chance to disagree, and a shared card that quotes a different number from
 * the page it links to is worse than no card at all.
 *
 * Request-cached, because `generateMetadata` and the page body both need it
 * and Next calls them separately. Without this the board is built twice per
 * request — two passes over the job index and two attestation-author
 * lookups — and the second build could even resolve a different figure from
 * the one the page's own metadata quoted.
 */
export const loadLeaderboardCard = cache(async function loadLeaderboardCard(params: {
  network: string;
  metric: string;
  chainId: string;
  tokenId: string;
}): Promise<
  | { state: 'ready'; card: LeaderboardCard; network: BoardNetwork; metric: OutcomeMetric }
  /* The agent has no qualifying row on this board. Not an error, and not a zero. */
  | { state: 'no-row'; network: BoardNetwork; metric: OutcomeMetric }
  | { state: 'unavailable'; network: BoardNetwork; metric: OutcomeMetric }
> {
  const network = boardNetworkFrom(params.network);
  const metric = outcomeMetricFrom(params.metric);
  const board = await loadOutcomeBoard(network, metric);
  if (board.state !== 'ready') return { state: 'unavailable', network, metric };
  const key = `${params.chainId}:${params.tokenId}`;
  const row = board.data.rows.find((candidate) => candidate.agent.key === key);
  if (!row) return { state: 'no-row', network, metric };
  return {
    state: 'ready',
    card: leaderboardCard(row, { network, metric, lastRefreshedAt: board.data.coverage.lastRefreshedAt }),
    network,
    metric,
  };
});
