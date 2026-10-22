import type { JobStatusName } from '@/lib/erc8183/types';

interface JobLike {
  jobId: string;
  chainId: number;
  agentChainId?: number;
  agentTokenId: string;
  client?: string;
  hiredAt: string;
  status: JobStatusName;
}

/** Ended without the work being paid for: the buyer got the money back, and can hire again. */
const RETURNED: ReadonlySet<JobStatusName> = new Set(['REJECTED', 'EXPIRED']);

/**
 * The job a chosen proposal became, read from the public job index.
 *
 * Nothing links a hire back to the request it came from: `?proposal=`
 * only carries the price into the hire page. So the proposal card kept
 * offering "Hire and fund" after the buyer had done exactly that. A
 * request is a promise between one poster and one agent on one network,
 * so a job matching all three, funded after the proposal was placed, is
 * that hire. Every indexed job is verified against the chain before it is
 * kept, so the match cannot be claimed into existence by a request.
 *
 * The newest match wins. If it was refunded or expired, the hire is
 * reported as `returned` so the card can offer the hire again rather than
 * pointing at a job that paid nobody.
 */
export function hireForProposal(
  jobs: readonly JobLike[],
  want: { poster: string; chainId: number; agentChainId: number; agentTokenId: string; placedAt: string },
): { jobId: string; chainId: number; status: JobStatusName; returned: boolean } | null {
  const poster = want.poster.toLowerCase();
  const since = Date.parse(want.placedAt);
  const match = jobs
    .filter(
      (job) =>
        job.client?.toLowerCase() === poster &&
        job.chainId === want.chainId &&
        (job.agentChainId ?? 56) === want.agentChainId &&
        job.agentTokenId === want.agentTokenId &&
        Date.parse(job.hiredAt) >= since,
    )
    .sort((a, b) => Date.parse(b.hiredAt) - Date.parse(a.hiredAt))[0];
  if (!match) return null;
  return { jobId: match.jobId, chainId: match.chainId, status: match.status, returned: RETURNED.has(match.status) };
}
