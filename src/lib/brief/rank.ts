import { preferDistinctOwners, type Listing } from '@/lib/marketplace';
import type { TrackRecord } from '@/lib/history/record';
import { interpretBrief, type BriefReading } from '@/lib/brief/interpret';

/**
 * Turn a brief into a shortlist, in one place.
 *
 * The ask panel and the catalogue both answer the same question, and they were
 * about to answer it with two copies of the same sort. Two copies drift: the
 * one people type into on the landing page would eventually rank differently
 * from the one in the corner of Discover, and nothing would say which was
 * right.
 *
 * The order is the marketplace's argument, not a relevance score. A signed
 * price comes first because it is the only thing here that makes an agent
 * actually hireable; then how much it has answered, because that is what
 * Pokter measured; then attestations, because somebody other than us said so.
 */
type Entry = { listing: Listing; record: TrackRecord };

export function rankForBrief(
  brief: string,
  entries: Entry[],
  limit: number,
): { reading: BriefReading; results: Entry[] } {
  const reading = interpretBrief(brief);

  const pool = reading.category
    ? entries.filter((entry) => entry.listing.category === reading.category)
    : entries;

  const ranked = [...pool].sort((a, b) => {
    const quoted =
      Number(b.listing.quote != null) - Number(a.listing.quote != null);
    if (quoted !== 0) return quoted;
    const answered = b.record.totalAnswered - a.record.totalAnswered;
    if (answered !== 0) return answered;
    return b.listing.attestationCount - a.listing.attestationCount;
  });

  return { reading, results: preferDistinctOwners(ranked, limit) };
}

