/**
 * Which inbox items a buyer has already seen, across their devices.
 *
 * The inbox itself is derived: every item comes from a job's own state on
 * chain, so any device rebuilds the same list. What does not travel is
 * whether somebody has looked at it — read on a phone, still badged on a
 * laptop, and a cleared cache marks months of settled work unread.
 *
 * So one value is shared instead of a list: a watermark saying everything
 * created up to this instant has been seen. It is small, it needs no
 * reconciliation, and it cannot grow without bound the way a set of item
 * ids would.
 *
 * Moving it is a privileged act, which is the uncomfortable part. Hiding an
 * unread "delivery ready" badge can cost a buyer their review window, so a
 * stranger must not be able to do it by knowing a public wallet address.
 * The write carries a token the wallet signed for, and that token
 * authorises nothing else: if one leaks, the worst available outcome is a
 * wrong badge.
 */

/** Long enough that a buyer is not re-signing every week. */
export const READ_TOKEN_TTL_MS = 90 * 24 * 60 * 60_000;

export interface Watermark {
  /** Everything created at or before this instant has been seen. */
  seenThrough: string;
}

/**
 * The later of two watermarks, always.
 *
 * Monotonic on purpose. A device that was offline holds a stale value, and
 * letting it win would mark settled work unread again on every sync — a
 * badge that comes back is worse than one that never cleared, because the
 * buyer stops believing any of them.
 */
export function mergeWatermark(a: Watermark | null, b: Watermark | null): Watermark | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a.seenThrough) >= Date.parse(b.seenThrough) ? a : b;
}

export interface ReadableItem {
  createdAt: string;
  /** This device's own note, kept so a single item can be read on its own. */
  readAt?: string | null;
}

/**
 * Whether an item counts as read.
 *
 * Either mark is enough. The watermark covers "I have looked at my inbox",
 * which is what crosses devices; the local note covers "I opened this one",
 * which is immediate and need not wait for a round trip.
 */
export function itemRead(item: ReadableItem, watermark: Watermark | null): boolean {
  if (item.readAt) return true;
  if (!watermark) return false;
  return Date.parse(item.createdAt) <= Date.parse(watermark.seenThrough);
}

export function unreadCount(items: readonly ReadableItem[], watermark: Watermark | null): number {
  return items.reduce((total, item) => (itemRead(item, watermark) ? total : total + 1), 0);
}

/**
 * The watermark to write when somebody opens their inbox.
 *
 * The newest item's own timestamp, not the clock. Using "now" would also
 * cover items created between the render and the write — work the buyer
 * has not seen, marked read because they happened to be looking at the
 * page when it arrived.
 */
export function watermarkFor(items: readonly ReadableItem[]): Watermark | null {
  let latest: number | null = null;
  for (const item of items) {
    const at = Date.parse(item.createdAt);
    if (Number.isFinite(at) && (latest === null || at > latest)) latest = at;
  }
  return latest === null ? null : { seenThrough: new Date(latest).toISOString() };
}

/** Whether a stored token may still be used. */
export function readTokenUsable(token: { expiresAt: string } | null, now = Date.now()): boolean {
  return Boolean(token && Date.parse(token.expiresAt) > now);
}
