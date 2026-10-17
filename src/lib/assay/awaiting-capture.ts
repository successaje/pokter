import type { HiredJob } from '@/lib/erc8183/types';

import type { AssayScenarioResult } from './types';

/**
 * A fixture the chain says is delivered, whose deliverable Pokter has not
 * fetched and verified yet (see capture.ts). Pending, never "undelivered":
 * Venus Rate Router's settled jobs 1520 and 1521 were graded as delivering
 * nothing because the grader only looked in Pokter's own store.
 */
export function awaitingCapture(job: Pick<HiredJob, 'status'>, stored: unknown): boolean {
  return !stored && (job.status === 'SUBMITTED' || job.status === 'COMPLETED');
}

export function awaitingRow(scenario: string, job: Pick<HiredJob, 'jobId' | 'status'>): AssayScenarioResult {
  return {
    scenario,
    jobId: job.jobId,
    expected: null,
    observed: null,
    excerpt: null,
    pass: false,
    outcome: 'pending',
    reason: `Delivered (the job is ${job.status} on chain), but Pokter has not yet fetched the deliverable and checked it against its on-chain hash, so it is not graded.`,
    latencyMs: null,
  };
}

/**
 * Whether a recorded run called a job undelivered that the chain now says
 * was delivered. Such a run is stale, not final: the outside agents graded
 * before Pokter could fetch their deliveries were recorded 0/3 and, because
 * the same jobs had been graded, were never looked at again.
 */
export function gradedAsUndeliveredSinceDelivered(
  results: ReadonlyArray<{ jobId?: string | null; outcome?: string }>,
  jobs: Iterable<Pick<HiredJob, 'jobId' | 'status'>>,
): boolean {
  const delivered = new Set<string>();
  for (const job of jobs) if (job.status === 'SUBMITTED' || job.status === 'COMPLETED') delivered.add(job.jobId);
  return results.some((result) => result.outcome === 'undelivered' && result.jobId != null && delivered.has(result.jobId));
}
