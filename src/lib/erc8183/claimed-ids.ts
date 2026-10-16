import type { HiredJob } from '@/lib/erc8183/types';

/**
 * Jobs, minus any whose escrow id another agent's later job also holds.
 *
 * A hire predicts its job id before sending. On 16 October one fixture
 * hire created nothing and was still recorded as job 1522; the next hire,
 * for another agent, then created 1522 for real. Two agents' rows held one
 * id, and the sweep copies the chain's status and delivery onto rows by id,
 * so the phantom would have been graded on the other agent's answer. The
 * phantom is always the earlier row: it claimed the id before anything
 * existed there. Hires now confirm the id on chain before recording
 * (hire-confirm.ts), so this only clears rows written before that.
 */
export function withoutClaimedIds(jobs: readonly HiredJob[]): HiredJob[] {
  const latest = new Map<string, HiredJob>();
  for (const job of jobs) {
    const key = `${job.chainId}:${job.jobId}`;
    const held = latest.get(key);
    if (!held || Date.parse(job.hiredAt) > Date.parse(held.hiredAt)) latest.set(key, job);
  }
  return jobs.filter((job) => {
    const holder = latest.get(`${job.chainId}:${job.jobId}`)!;
    const sameAgent = holder.agentTokenId === job.agentTokenId && (holder.agentChainId ?? holder.chainId) === (job.agentChainId ?? job.chainId);
    return holder === job || sameAgent;
  });
}
