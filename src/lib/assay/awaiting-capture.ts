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

/**
 * Whether a run called a delivery unreadable that Pokter has since stored.
 *
 * A file is stored only once it matches its on-chain hash, so a stored file
 * means the earlier "does not match" no longer holds. Nagi's three grid
 * checks (97:1511–1513) were intact all along: Pokter accepted one way of
 * hashing and Nagi used another. Once the check learned the second way, the
 * files could be stored, but a finished run is never looked at again, so the
 * page would have kept saying "unverifiable".
 */
export function gradedAsUnreadableSinceStored(
  results: ReadonlyArray<{ jobId?: string | null; outcome?: string; observed?: unknown }>,
  isStored: (jobId: string) => boolean,
): boolean {
  return results.some((result) => isMismatchRow(result) && result.jobId != null && isStored(result.jobId));
}

/*
 * Only a hash mismatch (`mismatchRow`, which records the served hash).
 * Graders also call a stored file "unreadable" when it holds no answer they
 * can read; that row is final, and treating it as stale would regrade it
 * on every sweep.
 */
function isMismatchRow(result: { outcome?: string; observed?: unknown }): boolean {
  return result.outcome === 'unreadable' && typeof result.observed === 'object' && result.observed !== null && 'served' in result.observed;
}

/**
 * A delivery Pokter fetched that does not hash to what the job committed
 * on chain. Graded as unreadable, and counted: a buyer cannot verify what
 * they were given. Worded as the fact it is, not as a judgement of intent.
 */
export function mismatchRow(scenario: string, job: Pick<HiredJob, 'jobId'>, mismatch: { servedHash: string; chainHash: string }): AssayScenarioResult {
  return {
    scenario,
    jobId: job.jobId,
    expected: { deliverable: mismatch.chainHash },
    observed: { served: mismatch.servedHash },
    excerpt: null,
    pass: false,
    outcome: 'unreadable',
    reason: `Delivered, but the file at its link does not match the hash the job committed on chain (served ${mismatch.servedHash.slice(0, 10)}…, committed ${mismatch.chainHash.slice(0, 10)}…), so it cannot be verified or graded.`,
    latencyMs: null,
  };
}
