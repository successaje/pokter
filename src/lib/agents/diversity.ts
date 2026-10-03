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

/**
 * At most `max` listings from any one publisher in a single category.
 *
 * `collapseClones` already folds away byte-identical descriptions, and it
 * is not enough. One publisher holds seventeen listings in the yield
 * category — sequential mints of the same agent, numbered #10922, #10937,
 * #10952 and so on, differing only by an NFT tier word in the blurb. Eight
 * distinct description strings between seventeen entries, so exact-match
 * collapsing keeps every one of them, and they are sixty-three per cent of
 * that category.
 *
 * Nothing is deleted or hidden from the registry: the overflow stays
 * reachable on the publisher's profile, by direct link, and through search.
 * What it loses is the right to fill a shelf a buyer is scanning to answer
 * "which of these should I hire", where the seventeenth mint of one agent
 * adds nothing the second did not.
 *
 * Expects ranked input and keeps the best. Called after the sort for that
 * reason — capping first would keep whichever happened to arrive first.
 */
export function capPerOwner<T extends { agent: { owner_address?: string | null } }>(
  ranked: T[],
  max: number,
): T[] {
  const counts = new Map<string, number>();

  return ranked.filter((entry) => {
    const owner = entry.agent.owner_address?.toLowerCase();
    // An unattributed listing is not evidence of shared ownership.
    if (!owner) return true;
    const seen = counts.get(owner) ?? 0;
    if (seen >= max) return false;
    counts.set(owner, seen + 1);
    return true;
  });
}
