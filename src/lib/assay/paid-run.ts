import 'server-only';

import type { Address } from 'viem';

import type { HiredJob } from '@/lib/erc8183/types';

import { deliverableKey, readDeliverable } from '@/lib/erc8183/deliverables';
import { getJobStore } from '@/lib/erc8183/store';

import { STATIC_SUITES, type StaticAssayCategory } from './category-suites';
import { HF_SUITE_ID } from './health-factor';
import { categoryOfSuite, fixtureJobsBySuite, readCheckMarker } from './paid-brief';
import { gradePaidHfScenario } from './paid-hf-grade';
import { readVenusPosition, venusClient } from './venus';
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

/**
 * This agent's fixture jobs for a suite, by its registry identity.
 *
 * Deliberately not `byAgent`: that matches a NULL `agent_chain_id` as
 * chain 56, so a hire of a chain-97 agent recorded without its registry
 * chain was invisible to it — and the route used it to decide what had
 * already been hired, which would have funded the same fixtures twice.
 * One lookup for the guard and the grader, so the two cannot disagree.
 */
export function fixtureJobsForAgent(target: { chainId: number; tokenId: string }, suiteId: string): Map<string, HiredJob> {
  const mine = getJobStore()
    .all()
    .filter((job) => job.agentTokenId === target.tokenId && (job.agentChainId ?? job.chainId) === target.chainId);
  return fixtureJobsBySuite(mine, suiteId);
}

/** A job that may still deliver: funded or submitted, deadline not passed. */
function deliveryOpen(job: HiredJob, now = Date.now()): boolean {
  if (job.status !== 'FUNDED' && job.status !== 'SUBMITTED') return false;
  const deadline = Date.parse(job.expiredAt);
  return !Number.isFinite(deadline) || now < deadline;
}

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

  const fixtures = fixtureJobsForAgent(target, suite.id);

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
      deliveryOpen: deliveryOpen(job),
    });
  });

  /*
   * A fixture still inside its delivery window is not a failure. Scored
   * rows are the ones that have resolved; with none resolved there is no
   * check yet, which is not the same as a check the agent failed.
   */
  const scored = results.filter((result) => result.outcome !== 'pending');
  if (scored.length === 0) {
    return { state: 'incomplete', hired: fixtures.size, total: suite.scenarios.length, missing: results.map((r) => r.scenario) };
  }

  const run: Omit<AssayRun, 'ranAt'> = {
    suite: suite.id,
    status: 'checked',
    detail: scored.length < results.length ? `${results.length - scored.length} of ${results.length} fixtures are still inside their delivery window and are not counted yet.` : null,
    passed: scored.filter((result) => result.pass).length,
    total: scored.length,
    via: 'paid-hire',
    results,
  };

  if (record) getAssayStore().record(target, run);
  return { state: 'recorded', run };
}

/**
 * Grade a health-factor agent's paid fixtures against Venus now.
 *
 * Unlike the static suites this reads the chain, because the right answer
 * is a live position. Scenarios that cannot fairly be compared — the
 * position moved between the delivery and the reading — are set aside
 * rather than counted as failures, so `total` is what was actually
 * gradeable and `passed === total` keeps meaning what it says. With
 * nothing gradeable, nothing is recorded: there is no check, which is not
 * the same as a check the agent failed.
 */
export async function gradePaidHealthFactorCheck(
  target: { chainId: number; tokenId: string },
  { record = true }: { record?: boolean } = {},
): Promise<PaidCheckOutcome> {
  const fixtures = fixtureJobsForAgent(target, HF_SUITE_ID);
  if (fixtures.size === 0) return { state: 'incomplete', hired: 0, total: 0, missing: [] };

  const client = venusClient();
  const readAt = new Date().toISOString();
  const graded: AssayScenarioResult[] = [];

  for (const [account, job] of fixtures) {
    const reading = await readVenusPosition(client, account as Address).catch(() => null);
    const stored = readDeliverable(deliverableKey(job.chainId, job.jobId));
    graded.push(
      gradePaidHfScenario({
        account,
        jobId: job.jobId,
        manifestText: stored?.manifestText ?? null,
        deliveryOpen: deliveryOpen(job),
        reading: reading ? { healthFactor: reading.healthFactor, borrowLimitRatio: reading.borrowLimitRatio, liquidatable: reading.liquidatable } : null,
        readAt,
      }),
    );
  }

  /*
   * Two different reasons a row is not scored, and they must not be
   * described as each other: still inside its delivery window, or
   * delivered against a position that had moved too far to compare.
   * Neither counts for or against the agent.
   */
  const pending = graded.filter((result) => result.outcome === 'pending').length;
  const moved = graded.filter((result) => result.outcome === 'not-comparable').length;
  const comparable = graded.filter((result) => result.outcome !== 'not-comparable' && result.outcome !== 'pending');
  if (comparable.length === 0) {
    return { state: 'incomplete', hired: fixtures.size, total: fixtures.size, missing: graded.map((result) => result.scenario) };
  }

  const aside = [
    pending > 0 ? `${pending} still inside its delivery window` : null,
    moved > 0 ? `${moved} delivered against a position that had moved too far from Pokter's reading to compare` : null,
  ].filter(Boolean);

  const run: Omit<AssayRun, 'ranAt'> = {
    suite: HF_SUITE_ID,
    status: 'checked',
    detail: aside.length > 0 ? `Of ${graded.length} fixtures, ${aside.join(' and ')}. Those are not counted either way.` : null,
    passed: comparable.filter((result) => result.pass).length,
    total: comparable.length,
    via: 'paid-hire',
    // Every row is kept, including the ones set aside, so a reader sees them.
    results: graded,
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

/**
 * Grade every health-factor agent that has paid fixtures.
 *
 * Separate from `gradeDuePaidChecks` because this one reads Venus, so it is
 * async and can fail on the network. The static markers are skipped there
 * by `categoryOfSuite`, which knows nothing of `hf-venus-1`.
 */
export async function gradeDuePaidHfChecks(): Promise<{ graded: number; incomplete: number; passedAll: number }> {
  const agents = new Map<string, { chainId: number; tokenId: string }>();
  for (const job of getJobStore().all()) {
    const marker = readCheckMarker(job.task);
    if (!marker || marker.suite !== HF_SUITE_ID) continue;
    const chainId = job.agentChainId ?? job.chainId;
    agents.set(`${chainId}:${job.agentTokenId}`, { chainId, tokenId: job.agentTokenId });
  }

  let graded = 0;
  let incomplete = 0;
  let passedAll = 0;
  for (const target of agents.values()) {
    const outcome = await gradePaidHealthFactorCheck(target).catch(() => null);
    if (outcome?.state === 'recorded') {
      graded += 1;
      if (outcome.run.passed === outcome.run.total) passedAll += 1;
    } else if (outcome?.state === 'incomplete') {
      incomplete += 1;
    }
  }
  return { graded, incomplete, passedAll };
}
