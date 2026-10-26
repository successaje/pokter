import { isDollarUJob, serializableTotals, totalsByToken } from './job-amount';
import type { HiredJob, JobStatusName } from './types';

const STATUSES: JobStatusName[] = ['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'];

export interface MarketplaceActivityStats {
  indexedJobs: number;
  byStatus: Record<JobStatusName, number>;
  activeJobs: number;
  completedJobs: number;
  /** $U only: jobs in the escrow default token. Other money is in `valueByToken`, never added here. */
  indexedValueRaw: string;
  completedValueRaw: string;
  /** Every job's value per chain and token, unknown tokens in their own bucket. */
  valueByToken: { indexed: ReturnType<typeof serializableTotals>; completed: ReturnType<typeof serializableTotals> };
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
    if (isDollarUJob(job)) {
      indexedValue += budget;
      if (job.status === 'COMPLETED') completedValue += budget;
    }
    if (!lastCheckedAt || job.statusCheckedAt > lastCheckedAt) lastCheckedAt = job.statusCheckedAt;
  }
  return {
    indexedJobs: jobs.length,
    byStatus,
    activeJobs: byStatus.FUNDED + byStatus.SUBMITTED,
    completedJobs: byStatus.COMPLETED,
    indexedValueRaw: indexedValue.toString(),
    completedValueRaw: completedValue.toString(),
    valueByToken: {
      indexed: serializableTotals(totalsByToken(jobs)),
      completed: serializableTotals(totalsByToken(jobs.filter((job) => job.status === 'COMPLETED'))),
    },
    lastCheckedAt,
  };
}
