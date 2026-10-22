/**
 * How much of a trading wallet's history Pokter has actually checked, so
 * the page never says "nothing left this wallet" about blocks it did not
 * read.
 *
 * It did: an unwatched wallet, one whose every scan had failed, and one
 * the sweep had stopped reaching all showed the same empty list under the
 * same reassuring sentence. Only `current` may say nothing was found.
 *
 * No error text: a failed read's message can carry the RPC URL, and the
 * mainnet one is configured from the environment.
 */

/** The sweep runs about every ten minutes; three missed runs is no longer "watching". */
export const STALE_AFTER_MS = 30 * 60_000;
/** About 25 minutes of BNB Chain blocks: a scan capped by `bound.ts` that has not caught up. */
export const BEHIND_BLOCKS = 2_000;

export type Coverage =
  | { state: 'unwatched' }
  | { state: 'never-scanned'; failed: boolean }
  | { state: 'failing'; lastScanAt: string | null; scannedTo: number }
  | { state: 'stale'; lastScanAt: string; scannedTo: number }
  | { state: 'behind'; lastScanAt: string; scannedTo: number; head: number }
  | { state: 'current'; lastScanAt: string; scannedTo: number };

export function coverage(
  watched: { lastScanAt: string | null; lastError: string | null; scannedTo: number | null } | null,
  now: number,
  /** The chain head, when known, so a wallet still catching up is not called current. */
  head?: number,
): Coverage {
  if (!watched) return { state: 'unwatched' };
  if (watched.scannedTo === null) return { state: 'never-scanned', failed: Boolean(watched.lastError) };
  if (watched.lastError) return { state: 'failing', lastScanAt: watched.lastScanAt, scannedTo: watched.scannedTo };
  if (!watched.lastScanAt || now - Date.parse(watched.lastScanAt) > STALE_AFTER_MS) return { state: 'stale', lastScanAt: watched.lastScanAt ?? '', scannedTo: watched.scannedTo };
  if (head !== undefined && head - watched.scannedTo > BEHIND_BLOCKS) return { state: 'behind', lastScanAt: watched.lastScanAt, scannedTo: watched.scannedTo, head };
  return { state: 'current', lastScanAt: watched.lastScanAt, scannedTo: watched.scannedTo };
}
