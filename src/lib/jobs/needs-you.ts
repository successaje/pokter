/**
 * Which of a buyer's jobs to put in front of them, and in what order.
 *
 * Every job needing attention was listed, so a buyer with eleven deliveries
 * to review met eleven identical cards in arrival order — a list, not a
 * prompt. Three are shown, and the rest are counted behind "View all".
 *
 * Ordered by deadline, soonest first. The consequence of ignoring a job is
 * the only thing that distinguishes one of these cards from another: a
 * review window closing today matters more than one closing next week, and
 * an escrow about to pass its deadline matters more than either. A job with
 * no readable deadline sorts last rather than first, so a missing date can
 * never jump the queue ahead of a real one.
 */

export const NEEDS_SHOWN = 3;

export function prioritiseNeedsYou<T extends { expiredAt: string }>(items: readonly T[]): T[] {
  const deadline = (item: T) => {
    const at = Date.parse(item.expiredAt);
    return Number.isFinite(at) ? at : Number.POSITIVE_INFINITY;
  };
  // Stable: equal deadlines keep the order they arrived in.
  return items.map((item, index) => ({ item, index })).sort((a, b) => deadline(a.item) - deadline(b.item) || a.index - b.index).map(({ item }) => item);
}

export function splitNeedsYou<T extends { expiredAt: string }>(items: readonly T[], shown = NEEDS_SHOWN): { shown: T[]; remaining: number } {
  const ordered = prioritiseNeedsYou(items);
  return { shown: ordered.slice(0, shown), remaining: Math.max(0, ordered.length - shown) };
}
