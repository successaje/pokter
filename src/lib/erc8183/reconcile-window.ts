/**
 * How far one reconciliation pass reaches.
 *
 * Pure, and kept out of `reconcile.ts`, which is `server-only` and so
 * cannot be imported by a test. This is the arithmetic that decides what
 * a scheduled run actually covers — the part that silently stops working
 * if somebody changes a constant — so it is the part worth pinning.
 *
 * Bounded on purpose. The escrow's mainnet counter is past 56,000, and
 * walking all of it on every sweep would be a denial-of-service against a
 * public node for no gain.
 */

/** How far back a chain looks the first time it is reconciled. */
export const FIRST_RUN_WINDOW = 400;

/** Most jobs read in one pass, so a long backlog cannot stall a sweep. */
export const MAX_PER_RUN = 250;

export interface ScanRange {
  from: number;
  to: number;
  /** How many job ids this pass will read. Zero when already caught up. */
  covered: number;
}

/**
 * The next range to read, given the escrow's counter and where the last
 * pass stopped.
 *
 * A first run starts one window back from the counter rather than at job
 * one: the point is to recover what a browser failed to report recently,
 * not to re-derive the whole history of the contract.
 */
export function scanRange(counter: number, cursor: string | null): ScanRange {
  const from = cursor
    ? Number(cursor) + 1
    : Math.max(1, counter - FIRST_RUN_WINDOW + 1);
  const to = Math.min(counter, from + MAX_PER_RUN - 1);
  return { from, to, covered: Math.max(0, to - from + 1) };
}
