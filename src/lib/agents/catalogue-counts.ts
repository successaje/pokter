import { isPromotableAgent } from '@/lib/agents/eligibility';
import { distinctAgentCount } from '@/lib/agents/distinct';
import { offersDirectHire, type SearchableAgent } from '@/lib/search/match';

/**
 * The catalogue's headline figures, from one rule.
 *
 * The home page, Discover and the methodology census each counted for
 * themselves, at different depths and with different rules, and showed three
 * different numbers for "signed a price". Every page now calls this, over the
 * same catalogue read, and an agent registered on both chains by the same
 * owner counts once.
 */
export function catalogueCounts(entries: SearchableAgent[]): { hireable: number; priced: number } {
  const promotable = entries.filter((entry) => isPromotableAgent(entry.listing.agent));
  return {
    hireable: distinctAgentCount(promotable.filter((entry) => offersDirectHire(entry)).map((entry) => entry.listing.agent)),
    priced: distinctAgentCount(promotable.filter((entry) => entry.listing.quote != null).map((entry) => entry.listing.agent)),
  };
}
