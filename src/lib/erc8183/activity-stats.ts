import type { HiredJob, JobStatusName } from './types';

const STATUSES: JobStatusName[] = ['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'];

export interface MarketplaceActivityStats {
  indexedJobs: number;
  byStatus: Record<JobStatusName, number>;
  activeJobs: number;
  completedJobs: number;
  indexedValueRaw: string;
  completedValueRaw: string;
  lastCheckedAt: string | null;
}

/** Aggregate adoption without exposing buyers, task text or provider wallets. */
export function summarizeMarketplaceActivity(jobs: HiredJob[]): MarketplaceActivityStats {
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<JobStatusName, number>;
  let indexedValue = 0n;
  let completedValue = 0n;
  let lastCheckedAt: string | null = null;
  for (const job of jobs) {
    byStatus[job.status] += 1;
    const budget = BigInt(job.budgetRaw);
    indexedValue += budget;
    if (job.status === 'COMPLETED') completedValue += budget;
    if (!lastCheckedAt || job.statusCheckedAt > lastCheckedAt) lastCheckedAt = job.statusCheckedAt;
  }
  return {
    indexedJobs: jobs.length,
    byStatus,
    activeJobs: byStatus.FUNDED + byStatus.SUBMITTED,
    completedJobs: byStatus.COMPLETED,
    indexedValueRaw: indexedValue.toString(),
    completedValueRaw: completedValue.toString(),
    lastCheckedAt,
  };
}
