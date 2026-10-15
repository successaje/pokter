import 'server-only';

import { deliverableKey, readDeliverable } from '@/lib/erc8183/deliverables';
import { getJobStore } from '@/lib/erc8183/store';

import { STATIC_SUITES, type StaticAssayCategory } from './category-suites';
import { categoryOfSuite, fixtureJobsBySuite, readCheckMarker } from './paid-brief';
import { gradePaidScenario } from './paid-grade';
import { getAssayStore } from './store';
import type { AssayRun, AssayScenarioResult } from './types';

/**
 * A correctness check assembled from the agent's own paid deliveries.
 *
 * The free-call check asks an agent directly and grades the reply. Agents
 * that sell their work answer that with a price, so they recorded
 * `paid-only` and could never pass — see `paid-grade.ts` for why that left
 * the commercially real agents unchecked.
 *
 * Here the fixtures are hired. Each scenario of a suite is funded as its
 * own ERC-8183 job whose task carries the scenario's id (`paid-brief.ts`),
 * and the artifact that comes back is graded by the same judge the free
 * check uses. The money is real on mainnet and test tokens on 97; nothing
 * here funds anything, it only reads jobs that already exist.
 */

export type PaidCheckOutcome =
  | { state: 'recorded'; run: Omit<AssayRun, 'ranAt'> }
  /** Some scenarios have not been hired yet, so there is nothing to publish. */
  | { state: 'incomplete'; hired: number; total: number; missing: string[] }
  | { state: 'no-suite' };

/**
 * Grade what this agent delivered for a suite's fixtures, and record it.
 *
 * Nothing is recorded until every scenario has been hired. A partial run
 * would publish `passed < total` on an agent that simply has not been paid
 * for the rest yet, which reads as a correctness failure it did not earn —
 * the same mistake as counting a lifecycle demo as an accepted delivery.
 */
export function gradePaidCategoryCheck(
  target: { chainId: number; tokenId: string },
  category: StaticAssayCategory,
  { record = true }: { record?: boolean } = {},
): PaidCheckOutcome {
  const suite = STATIC_SUITES[category];
  if (!suite) return { state: 'no-suite' };

  const jobs = getJobStore().byAgent(target.chainId, target.tokenId);
  const fixtures = fixtureJobsBySuite(jobs, suite.id);

  const missing = suite.scenarios.filter((scenario) => !fixtures.has(scenario.id)).map((scenario) => scenario.id);
  if (missing.length > 0) {
    return { state: 'incomplete', hired: fixtures.size, total: suite.scenarios.length, missing };
  }

  const results: AssayScenarioResult[] = suite.scenarios.map((scenario) => {
    const job = fixtures.get(scenario.id)!;
    /*
     * Read by the escrow chain the job was funded on, not the agent's
     * registry chain: a mainnet-registered agent is hired on testnet
     * whenever its price cannot settle on 56, and keying the deliverable
     * by the wrong chain would find nothing and grade it undelivered.
     */
    const stored = readDeliverable(deliverableKey(job.chainId, job.jobId));
    return gradePaidScenario({
      scenario,
      jobId: job.jobId,
      manifestText: stored?.manifestText ?? null,
    });
  });

  const run: Omit<AssayRun, 'ranAt'> = {
    suite: suite.id,
    status: 'checked',
    detail: null,
    passed: results.filter((result) => result.pass).length,
    total: results.length,
    via: 'paid-hire',
    results,
  };

  if (record) getAssayStore().record(target, run);
  return { state: 'recorded', run };
}

/**
 * Grade every agent that has fixture jobs, wherever they have all arrived.
 *
 * A fixture hire is funded now and delivered minutes or hours later, so the
 * run cannot be assembled by whatever triggered the hire. This is cheap —
 * it reads two local stores and does arithmetic, with no network — so the
 * sweep calls it each pass and a check completes itself once the last
 * delivery lands.
 *
 * Re-grading an already-graded suite is deliberate: a redelivery after a
 * fix supersedes the earlier result, and `latest` reads the newest run.
 */
export function gradeDuePaidChecks(): { graded: number; incomplete: number; passedAll: number } {
  const bySuite = new Map<string, { chainId: number; tokenId: string; category: StaticAssayCategory }>();
  for (const job of getJobStore().all()) {
    const marker = readCheckMarker(job.task);
    if (!marker) continue;
    const category = categoryOfSuite(marker.suite);
    if (!category) continue;
    /*
     * Keyed by the agent's registry identity, which is what a check is
     * recorded against — not the escrow chain the job was funded on.
     */
    const agentChainId = job.agentChainId ?? job.chainId;
    bySuite.set(`${agentChainId}:${job.agentTokenId}:${marker.suite}`, { chainId: agentChainId, tokenId: job.agentTokenId, category });
  }

  let graded = 0;
  let incomplete = 0;
  let passedAll = 0;
  for (const target of bySuite.values()) {
    const outcome = gradePaidCategoryCheck({ chainId: target.chainId, tokenId: target.tokenId }, target.category);
    if (outcome.state === 'recorded') {
      graded += 1;
      if (outcome.run.passed === outcome.run.total) passedAll += 1;
    } else if (outcome.state === 'incomplete') {
      incomplete += 1;
    }
  }
  return { graded, incomplete, passedAll };
}
