import type { HiredJob } from '@/lib/erc8183/types';

export interface CampaignHireProgress {
  qualifyingJobs: HiredJob[];
  distinctAgents: number;
  completedJobs: number;
  pokterMarketplaceVerified: boolean;
}

/** Conservative summary: BNB Chain remains the final eligibility authority. */
export function summarizeCampaignHires(jobs: HiredJob[]): CampaignHireProgress {
  const qualifyingJobs = jobs.filter(
    (job) =>
      job.status !== 'OPEN' &&
      (job.chainId === 56 || job.chainId === 97) &&
      /^\d+$/.test(job.agentTokenId),
  );
  const agents = new Set(
    qualifyingJobs.map(
      (job) => `${job.agentChainId ?? job.chainId}:${job.agentTokenId}`,
    ),
  );

  return {
    qualifyingJobs,
    distinctAgents: agents.size,
    completedJobs: qualifyingJobs.filter((job) => job.status === 'COMPLETED')
      .length,
    pokterMarketplaceVerified: qualifyingJobs.length > 0,
  };
}
