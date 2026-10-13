import 'server-only';

import { CATEGORIES } from '@/lib/agents/categories';
import { listSearchableWithStatus } from '@/lib/marketplace';
import { getFunderStore } from '@/lib/funding/store';
import { operatorResolver } from '@/lib/funding/operator';
import { rankCategoryOutcomes, type CategoryOutcomeRanking, type OutcomeCandidate, type OutcomeFacts, type OutcomeScope } from './outcomes';

function allFacts(candidate: Awaited<ReturnType<typeof listSearchableWithStatus>>['entries'][number]): OutcomeFacts {
  const history = candidate.history;
  if (!history) return { jobs: 0, completed: 0, terminal: 0, uniqueBuyers: 0, completionRate: null };
  const terminal = history.completed + history.rejected + history.expired;
  return {
    jobs: history.jobs,
    completed: history.completed,
    terminal,
    uniqueBuyers: history.uniqueBuyers,
    completionRate: terminal > 0 ? history.completed / terminal : null,
  };
}

export async function loadOutcomeRankings(scope: OutcomeScope): Promise<{ rankings: CategoryOutcomeRanking[]; unreachable: boolean }> {
  const result = await listSearchableWithStatus({ limit: 400 });
  const candidates: OutcomeCandidate[] = result.entries.filter((entry) => entry.listing.category !== 'unclassified').map((entry) => ({
    key: `${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`,
    chainId: entry.listing.agent.chain_id,
    tokenId: entry.listing.agent.token_id,
    name: entry.listing.agent.name,
    imageUrl: entry.listing.agent.image_url ?? null,
    owner: entry.listing.agent.owner_address,
    category: entry.listing.category as OutcomeCandidate['category'],
    tested: entry.tested === true,
    delivered: entry.history?.delivered ?? 0,
    probeRate: entry.record.totalProbes > 0 ? entry.record.totalAnswered / entry.record.totalProbes : null,
    all: allFacts(entry),
    outsideTeam: entry.history?.outsideTeam ?? { jobs: 0, completed: 0, terminal: 0, uniqueBuyers: 0, completionRate: null },
  }));
  const owners = candidates.map((candidate) => candidate.owner);
  const operatorOf = operatorResolver(owners, getFunderStore().funders(owners));
  return { rankings: CATEGORIES.map((category) => rankCategoryOutcomes(category.id, candidates, scope, operatorOf)), unreachable: result.unreachable };
}
