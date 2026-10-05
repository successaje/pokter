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

/**
 * How much of the campaign Pokter can actually see, as a percentage.
 *
 * Out of what Pokter can verify, not out of five. Only three of the five
 * official tasks produce any signal here and one of those is worth half, so
 * a denominator of five meant the most a wallet could ever reach was 50% —
 * a bar that measured Pokter's visibility and reported the shortfall as the
 * user's. The ceiling is that limit, so full means "everything Pokter can
 * verify is done".
 *
 * Extracted from the passport because the account page shows the same number
 * in one line, and two copies of a scoring rule is how the two surfaces end
 * up disagreeing about the same wallet.
 */
export const CAMPAIGN_VISIBLE_CEILING = 1 + 1 + 0.5;

export function campaignVisiblePercent(input: {
  registered: boolean;
  distinctAgents: number;
  pokterMarketplaceVerified: boolean;
}): number {
  const milestones =
    Number(input.registered) +
    Math.min(Math.max(input.distinctAgents, 0), 3) / 3 +
    (input.pokterMarketplaceVerified ? 0.5 : 0);
  return Math.round(
    (Math.min(milestones, CAMPAIGN_VISIBLE_CEILING) / CAMPAIGN_VISIBLE_CEILING) * 100,
  );
}
