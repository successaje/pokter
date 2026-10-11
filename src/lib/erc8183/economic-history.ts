import { formatUnits } from 'viem';

import type { HiredJob } from './types';

export interface AgentEconomicHistory {
  jobs: number;
  delivered: number;
  completed: number;
  rejected: number;
  expired: number;
  /**
   * Funded jobs the agent let lapse: EXPIRED, or still FUNDED after the
   * deadline. The contract only marks a job EXPIRED once its escrow is
   * reclaimed, so a missed job nobody reclaimed still reads FUNDED, and
   * counting EXPIRED alone would understate misses.
   */
  missed: number;
  /** Funded and still inside the delivery window: not yet a pass or a miss. */
  pending: number;
  unresolved: number;
  totalFundedU: string;
  latestCheckedAt: string | null;
  recent: HiredJob[];
}

/**
 * Summarise only jobs Pokter has indexed and attributed to an ERC-8004
 * identity. This is deliberately not described as chain-wide activity: the
 * commerce contract does not carry the agent token id, so attribution depends
 * on Pokter's immutable job envelope and index.
 */
export function summariseEconomicHistory(jobs: HiredJob[], now = Date.now()): AgentEconomicHistory {
  // Entry into this store is itself chain-verified. Some relayed/batched hires
  // do not expose a transaction hash to the SDK even though the kernel reads
  // FUNDED, so requiring a hash here would silently erase valid paid work.
  const funded = jobs.filter((job) => job.status !== 'OPEN');
  const total = funded.reduce((sum, job) => sum + BigInt(job.budgetRaw), 0n);
  const lapsed = (job: HiredJob) => job.status === 'FUNDED' && Date.parse(job.expiredAt) <= now;

  return {
    jobs: funded.length,
    delivered: funded.filter((job) =>
      ['SUBMITTED', 'COMPLETED'].includes(job.status),
    ).length,
    completed: funded.filter((job) => job.status === 'COMPLETED').length,
    rejected: funded.filter((job) => job.status === 'REJECTED').length,
    expired: funded.filter((job) => job.status === 'EXPIRED').length,
    missed: funded.filter((job) => job.status === 'EXPIRED' || lapsed(job)).length,
    pending: funded.filter((job) => job.status === 'FUNDED' && !lapsed(job)).length,
    unresolved: funded.filter((job) =>
      ['FUNDED', 'SUBMITTED'].includes(job.status),
    ).length,
    totalFundedU: formatUnits(total, 18),
    latestCheckedAt:
      funded
        .map((job) => job.statusCheckedAt)
        .sort((a, b) => b.localeCompare(a))[0] ?? null,
    recent: funded.slice(0, 3),
  };
}
