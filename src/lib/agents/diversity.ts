import type { Listing } from '@/lib/marketplace';

/**
 * Push a publisher's second and later listings behind everyone else's first.
 *
 * Lives here rather than in `lib/marketplace` because that module is
 * `server-only` and the outcome browser on the landing page runs in the
 * browser. It is the same function either way: one implementation, because
 * two would eventually disagree about what a fair shortlist looks like.
 *
 * One publisher holds eighteen of the eighty listings, so a straight ranking
 * hands them whole shelves. Reporting that concentration is honest; letting
 * it fill a three-slot doorway is not.
 */
export function preferDistinctOwners<T extends { listing: Listing }>(
  ranked: T[],
  limit: number,
): T[] {
  const seen = new Set<string>();
  const first: T[] = [];
  const rest: T[] = [];

  for (const entry of ranked) {
    const owner = entry.listing.agent.owner_address?.toLowerCase() ?? '';
    if (owner && seen.has(owner)) {
      rest.push(entry);
      continue;
    }
    if (owner) seen.add(owner);
    first.push(entry);
  }

  return [...first, ...rest].slice(0, limit);
}
