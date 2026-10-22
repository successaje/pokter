/**
 * How much of a found range one scan reads, so one busy wallet cannot
 * spend the sweep.
 *
 * The logs for a range are one cheap query; each transaction in it is
 * then a receipt, a block and a pool check or two. A wallet that trades
 * every few blocks turned one scan into minutes, inside a sweep that has
 * 240 seconds for everything. So a scan reads at most `cap` transactions,
 * oldest first, and says how far that got it. The next sweep starts after
 * that block. A range is never recorded as read past what was read, and
 * one that falls out of the public node's reach meanwhile is recorded as
 * a gap, as any other.
 *
 * Whole blocks only: stopping inside a block and resuming after it would
 * skip the rest of that block.
 */
export function boundToCap<T extends { block: bigint }>(found: readonly T[], cap: number, toBlock: bigint): { read: T[]; coveredTo: bigint } {
  const sorted = [...found].sort((a, b) => (a.block < b.block ? -1 : a.block > b.block ? 1 : 0));
  if (sorted.length <= cap) return { read: sorted, coveredTo: toBlock };
  const next = sorted[cap].block;
  // If the first `cap` all sit in the block the cut falls in, read that whole block so the scan always moves forward.
  const stopAt = sorted[0].block === next ? next : next - 1n;
  return { read: sorted.filter((t) => t.block <= stopAt), coveredTo: stopAt };
}
