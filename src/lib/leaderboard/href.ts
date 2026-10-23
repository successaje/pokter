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
export function leaderboardHref(
  selection: Partial<BoardSelection> = {},
  /**
   * What the reader has narrowed the board to, carried through every other
   * link on the page.
   *
   * Dropping it would be the quiet kind of wrong: a reader who has searched
   * and then clicks a column header gets the whole board back, ordered
   * differently, with the search box still showing their term. The page
   * would then be describing a filter it is not applying.
   */
  browse: { search?: string; category?: string; page?: number } = {},
): string {
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
  const search = browse.search?.trim() ?? '';
  if (search.length > 0) params.set('q', search);
  if (browse.category && browse.category !== 'all') params.set('category', browse.category);
  /* Page one is the default, and `?page=1` in a shared link is noise that
     also makes the canonical board look like a paginated slice of itself. */
  if (browse.page !== undefined && browse.page > 1) params.set('page', String(browse.page));
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
