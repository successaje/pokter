import type { Category } from '@/lib/agents/categories';
import { isPromotableAgent } from '@/lib/agents/eligibility';
import { preferDistinctOwners } from '@/lib/agents/diversity';
import type { TrackRecord } from '@/lib/history/record';
import type { Listing } from '@/lib/marketplace';

type Entry = { listing: Listing; record: TrackRecord };

function evidenceRate(entry: Entry): number {
  return entry.record.totalProbes === 0
    ? -1
    : entry.record.totalAnswered / entry.record.totalProbes;
}

/**
 * The three agents an outcome offers: promotable agents in the category,
 * quoted first, then by observed answer rate, then by probe volume, with no
 * owner taking more than its share.
 */
export function outcomeShortlist<T extends Entry>(entries: T[], category: Category, limit = 3): T[] {
  const ranked = entries
    .filter(
      (entry) =>
        entry.listing.category === category &&
        isPromotableAgent(entry.listing.agent),
    )
    .sort((a, b) => {
      const quoted =
        Number(b.listing.quote != null) - Number(a.listing.quote != null);
      if (quoted !== 0) return quoted;
      const rate = evidenceRate(b) - evidenceRate(a);
      if (rate !== 0) return rate;
      return b.record.totalProbes - a.record.totalProbes;
    });

  return preferDistinctOwners(ranked, limit);
}
