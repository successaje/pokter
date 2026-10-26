import { jobToken } from '@/lib/erc8183/job-amount';
import { requestToken } from '@/lib/network/tokens';
import type { JobStatusName } from '@/lib/erc8183/types';

interface JobLike {
  jobId: string;
  chainId: number;
  agentChainId?: number;
  agentTokenId: string;
  client?: string;
  hiredAt: string;
  status: JobStatusName;
  /** The token the escrow holds the job's budget in; null or absent is not yet known. */
  paymentToken?: string | null;
  /** Base units of that token. */
  budgetRaw?: string;
}

const rawOf = (value: string | undefined): bigint | null => {
  try {
    return value !== undefined && /^\d+$/.test(value) ? BigInt(value) : null;
  } catch {
    return null;
  }
};

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
 * It must also be that hire's money: a job in the proposal's token, for no
 * more than the proposal's price. A job in another token is a different
 * hire, not this one paid differently; and one funded above the price is
 * not the proposal the poster chose. A job whose token is not yet known is
 * not counted — it is read from the escrow by the sweep, and claiming it
 * before then would be the guess `jobToken` exists to refuse.
 *
 * The newest match wins. If it was refunded or expired, the hire is
 * reported as `returned` so the card can offer the hire again rather than
 * pointing at a job that paid nobody.
 */
export function hireForProposal(
  jobs: readonly JobLike[],
  want: {
    poster: string;
    chainId: number;
    agentChainId: number;
    agentTokenId: string;
    placedAt: string;
    /** The proposal's token, resolved: a legacy proposal's $U written out (`requestToken`). */
    paymentToken: string;
    /** The proposal's price in base units of that token. */
    priceRaw: string;
  },
): { jobId: string; chainId: number; status: JobStatusName; returned: boolean } | null {
  const poster = want.poster.toLowerCase();
  const since = Date.parse(want.placedAt);
  const token = want.paymentToken.toLowerCase();
  const price = rawOf(want.priceRaw);
  if (price === null) return null;
  const sameMoney = (job: JobLike) => {
    const jobPaid = jobToken(job);
    const budget = rawOf(job.budgetRaw);
    return jobPaid !== null && jobPaid.toLowerCase() === token && budget !== null && budget <= price;
  };
  const match = jobs
    .filter(
      (job) =>
        job.client?.toLowerCase() === poster &&
        job.chainId === want.chainId &&
        (job.agentChainId ?? 56) === want.agentChainId &&
        job.agentTokenId === want.agentTokenId &&
        Date.parse(job.hiredAt) >= since &&
        sameMoney(job),
    )
    .sort((a, b) => Date.parse(b.hiredAt) - Date.parse(a.hiredAt))[0];
  if (!match) return null;
  return { jobId: match.jobId, chainId: match.chainId, status: match.status, returned: RETURNED.has(match.status) };
}

/**
 * `hireForProposal` for a stored request and its chosen proposal, with the
 * proposal's money resolved the one way: its own token, else its
 * request's, else — for rows from before either carried one — the chain's
 * $U (`requestToken`). Null when that names no token Pokter knows.
 */
export function hireForChosenProposal(
  jobs: readonly JobLike[],
  request: { poster: string; chainId: number; paymentToken: string | null },
  bid: { agentChainId: number; agentTokenId: string; placedAt: string; paymentToken: string | null; priceRaw: string },
): ReturnType<typeof hireForProposal> {
  const token = requestToken(request.chainId, bid.paymentToken ?? request.paymentToken);
  if (!token) return null;
  return hireForProposal(jobs, {
    poster: request.poster,
    chainId: request.chainId,
    agentChainId: bid.agentChainId,
    agentTokenId: bid.agentTokenId,
    placedAt: bid.placedAt,
    paymentToken: token.address,
    priceRaw: bid.priceRaw,
  });
}
