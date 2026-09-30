import { formatUnits } from 'viem';

import type { HiredJob } from './types';

export interface AgentEconomicHistory {
  jobs: number;
  delivered: number;
  completed: number;
  rejected: number;
  expired: number;
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
export function summariseEconomicHistory(jobs: HiredJob[]): AgentEconomicHistory {
  const funded = jobs.filter((job) => Boolean(job.hireTxHash) && job.status !== 'OPEN');
  const total = funded.reduce((sum, job) => sum + BigInt(job.budgetRaw), 0n);

  return {
    jobs: funded.length,
    delivered: funded.filter((job) =>
      ['SUBMITTED', 'COMPLETED'].includes(job.status),
    ).length,
    completed: funded.filter((job) => job.status === 'COMPLETED').length,
    rejected: funded.filter((job) => job.status === 'REJECTED').length,
    expired: funded.filter((job) => job.status === 'EXPIRED').length,
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
