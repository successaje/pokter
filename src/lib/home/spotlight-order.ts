import type { TrackRecord } from '@/lib/history/record';
import type { Listing } from '@/lib/marketplace';
import { offersDirectHire } from '@/lib/search/match';

export type SpotlightEntry = { listing: Listing; record: TrackRecord };
export type SpotlightTab = 'recommended' | 'recent';

/** −1 when nothing has been measured, so unprobed never outranks probed. */
export function responseRate(entry: SpotlightEntry): number {
  if (entry.record.totalProbes === 0) return -1;
  return entry.record.totalAnswered / entry.record.totalProbes;
}

/**
 * The order the homepage spotlight shows agents in.
 *
 * Extracted from the carousel so the ordering can be tested without
 * rendering it; the component imports this and does nothing else to the
 * sequence.
 */
export function rankedFor(
  tab: SpotlightTab,
  entries: SpotlightEntry[],
): SpotlightEntry[] {
  return [...entries].sort((a, b) => {
    if (tab === 'recent') {
      const aSeen = a.record.lastSeen ? Date.parse(a.record.lastSeen) : 0;
      const bSeen = b.record.lastSeen ? Date.parse(b.record.lastSeen) : 0;
      if (bSeen !== aSeen) return bSeen - aSeen;
    }

    /*
     * A signed price outranks a better answer rate.
     *
     * The spotlight is the first agent most visitors meet, and it was led by
     * the agent with the most probes regardless of whether it could be
     * bought — so the headline card read "No signed price" under a 100%
     * record, which is an advertisement for something not for sale. Ranking
     * is still evidence-first within the set that can actually be hired.
     */
    const priced =
      Number(Boolean(b.listing.quote)) - Number(Boolean(a.listing.quote));
    if (priced !== 0) return priced;

    const direct = Number(offersDirectHire(b)) - Number(offersDirectHire(a));
    if (direct !== 0) return direct;
    const rate = responseRate(b) - responseRate(a);
    if (rate !== 0) return rate;
    return b.record.totalProbes - a.record.totalProbes;
  });
}
