import type { Category } from '@/lib/agents/categories';

export type OutcomeScope = 'outside-team' | 'all';

export interface OutcomeFacts {
  jobs: number;
  completed: number;
  terminal: number;
  uniqueBuyers: number;
  completionRate: number | null;
}

export interface OutcomeCandidate {
  key: string;
  chainId: number;
  tokenId: string;
  name: string;
  imageUrl: string | null;
  owner: string;
  category: Category;
  tested: boolean;
  delivered: number;
  probeRate: number | null;
  all: OutcomeFacts;
  outsideTeam: OutcomeFacts;
}

export interface OutcomeEntry extends OutcomeCandidate {
  facts: OutcomeFacts;
  eligible: boolean;
  gaps: string[];
  explanation: string;
}

export interface CategoryOutcomeRanking {
  category: Category;
  publishRanks: boolean;
  eligibleAgents: number;
  entries: OutcomeEntry[];
}

export const MIN_OUTCOME_COMPLETIONS = 2;
export const MIN_OUTCOME_TERMINAL = 3;
export const MIN_OUTCOME_BUYERS = 2;
export const MIN_CATEGORY_CONTENDERS = 3;

export function outcomeGaps(facts: OutcomeFacts): string[] {
  return [
    facts.completed < MIN_OUTCOME_COMPLETIONS ? `${facts.completed}/${MIN_OUTCOME_COMPLETIONS} settled jobs` : null,
    facts.terminal < MIN_OUTCOME_TERMINAL ? `${facts.terminal}/${MIN_OUTCOME_TERMINAL} terminal jobs` : null,
    facts.uniqueBuyers < MIN_OUTCOME_BUYERS ? `${facts.uniqueBuyers}/${MIN_OUTCOME_BUYERS} known buyer wallets` : null,
  ].filter((gap): gap is string => gap !== null);
}

function compare(a: OutcomeEntry, b: OutcomeEntry): number {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  if (a.facts.completed !== b.facts.completed) return b.facts.completed - a.facts.completed;
  if (a.facts.uniqueBuyers !== b.facts.uniqueBuyers) return b.facts.uniqueBuyers - a.facts.uniqueBuyers;
  const rateA = a.facts.completionRate ?? -1;
  const rateB = b.facts.completionRate ?? -1;
  if (rateA !== rateB) return rateB - rateA;
  if (a.tested !== b.tested) return a.tested ? -1 : 1;
  if (a.delivered !== b.delivered) return b.delivered - a.delivered;
  return (b.probeRate ?? -1) - (a.probeRate ?? -1);
}

function toEntry(candidate: OutcomeCandidate, scope: OutcomeScope): OutcomeEntry {
  const facts = scope === 'outside-team' ? candidate.outsideTeam : candidate.all;
  const gaps = outcomeGaps(facts);
  const rate = facts.completionRate === null ? 'no terminal rate' : `${Math.round(facts.completionRate * 100)}% terminal completion`;
  return {
    ...candidate,
    facts,
    eligible: gaps.length === 0,
    gaps,
    explanation: `${facts.completed} settled · ${facts.uniqueBuyers} known buyer wallet${facts.uniqueBuyers === 1 ? '' : 's'} · ${rate}${candidate.tested ? ' · category suite passed' : ' · no full category-suite pass on record'}`,
  };
}

/**
 * Outcome ordering is lexicographic, not an opaque score. Accepted jobs lead,
 * then buyer diversity, terminal completion, category testing, delivery and
 * probe reliability. One operator can occupy only one place per category.
 */
export function rankCategoryOutcomes(
  category: Category,
  candidates: readonly OutcomeCandidate[],
  scope: OutcomeScope,
  operatorOf: (owner: string) => string = (owner) => `owner:${owner.toLowerCase()}`,
): CategoryOutcomeRanking {
  const ordered = candidates.filter((candidate) => candidate.category === category).map((candidate) => toEntry(candidate, scope)).sort(compare);
  const operators = new Set<string>();
  const entries = ordered.filter((entry) => {
    const operator = operatorOf(entry.owner);
    if (operators.has(operator)) return false;
    operators.add(operator);
    return true;
  });
  const eligibleAgents = entries.filter((entry) => entry.eligible).length;
  return { category, publishRanks: eligibleAgents >= MIN_CATEGORY_CONTENDERS, eligibleAgents, entries };
}
