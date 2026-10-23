import type { BoardNetwork } from './network';
import type { OutcomeMetric } from './outcomes';

export type BoardView = 'outcomes' | 'responsiveness';

export interface BoardSelection {
  network: BoardNetwork;
  view: BoardView;
  metric: OutcomeMetric;
}

export const DEFAULT_SELECTION: BoardSelection = {
  network: 'mainnet',
  view: 'outcomes',
  metric: 'settled-jobs',
};

export function boardViewFrom(raw: string | string[] | undefined): BoardView {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'responsiveness' ? 'responsiveness' : 'outcomes';
}

/**
 * The link to one board, with the defaults left out.
 *
 * One builder for the page's own tabs and for a shared card's way back, so
 * the two cannot produce different URLs for the same board — and so the
 * canonical link stays bare rather than carrying `?network=mainnet` that
 * means nothing. The card route puts the same three choices in its path,
 * and this is what turns them back into a query.
 */
export function leaderboardHref(selection: Partial<BoardSelection> = {}): string {
  const next = { ...DEFAULT_SELECTION, ...selection };
  const params = new URLSearchParams();
  if (next.network !== DEFAULT_SELECTION.network) params.set('network', next.network);
  if (next.view !== DEFAULT_SELECTION.view) params.set('view', next.view);
  /* The metric only orders the outcomes table, so carrying it onto the
     responsiveness view would put a parameter in the URL that changes
     nothing a reader can see. */
  if (next.view === 'outcomes' && next.metric !== DEFAULT_SELECTION.metric) {
    params.set('metric', next.metric);
  }
  const query = params.toString();
  return query ? `/leaderboard?${query}` : '/leaderboard';
}

/** Where a builder's shareable card for one row lives. */
export function leaderboardCardHref({
  network,
  metric,
  chainId,
  tokenId,
}: {
  network: BoardNetwork;
  metric: OutcomeMetric;
  chainId: number | string;
  tokenId: string;
}): string {
  return `/leaderboard/card/${network}/${metric}/${chainId}/${tokenId}`;
}
