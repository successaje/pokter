import { isPromotableAgent } from '@/lib/agents/eligibility';
import { letsJobsLapse, reliabilityScore } from '@/lib/search/order';
import type { SearchableAgent } from '@/lib/search/match';

/**
 * The agents the Set and Earn guide names as "hire these now".
 *
 * A recommendation is stronger than a listing, so the bar is higher than
 * hireable: an agent that has let more paid jobs lapse than it delivered is
 * never named, however well it answers probes. Answering a probe only shows
 * the agent card is public; an agent whose work endpoint refuses anonymous
 * callers answers every probe and misses every job, and its delivery record
 * is the only place that shows it.
 *
 * Agents that have delivered paid work come first, then the most reliable
 * this week. One per operator, so the three count as three different agents.
 */
export function guidePicks(
  entries: SearchableAgent[],
  options: {
    isHireable: (entry: SearchableAgent) => boolean;
    operatorOf?: (owner: string) => string;
    limit?: number;
  },
): SearchableAgent[] {
  const { isHireable, operatorOf = (owner) => owner.toLowerCase(), limit = 3 } = options;
  const operators = new Set<string>();
  return entries
    .filter((entry) => isHireable(entry) && isPromotableAgent(entry.listing.agent) && !letsJobsLapse(entry))
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const delivered = (b.entry.history?.delivered ?? 0) - (a.entry.history?.delivered ?? 0);
      if (delivered !== 0) return delivered;
      const scoreA = reliabilityScore(a.entry);
      const scoreB = reliabilityScore(b.entry);
      if (scoreA !== scoreB) return scoreA === null ? 1 : scoreB === null ? -1 : scoreB - scoreA;
      return a.index - b.index;
    })
    .map(({ entry }) => entry)
    .filter((entry) => {
      const operator = operatorOf(entry.listing.agent.owner_address);
      if (operators.has(operator)) return false;
      operators.add(operator);
      return true;
    })
    .slice(0, limit);
}
