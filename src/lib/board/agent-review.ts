import { encodeFunctionData, getAddress, type Address, type Hex } from 'viem';

import { ENDED_JOB_STATUSES, reviewableJob, type ReviewContent, type VerifiedReview } from '@/lib/reviews/model';
import { BOARD_CHAIN_ID, boardReviewCall, matchesBoardReview } from './contract';

/**
 * A review written on PokterBoard by the buyer's own wallet, for a wallet
 * that cannot sign Pokter's review message: an Agentic Wallet signs typed
 * data only. The transaction is the proof: it comes from the wallet that
 * funded the job, and the board itself checks the job and the Agent ID.
 *
 * Two steps. `prepareBoardReview` returns the call, once the board would
 * accept it; the owner previews and approves it in their wallet. Then
 * `verifyBoardReview` checks the sent transaction says exactly what the
 * buyer gave Pokter, comment included, before Pokter shows it.
 */

/** The job as the escrow reports it. */
export interface ReviewedJob {
  client: Address;
  provider: Address;
  statusName: string;
  submittedAt: bigint;
}

type Refusal = { ok: false; status: number; error: string };

/* The review as the board and Pokter's checks read it; nothing here is signed. */
function asReview(input: { jobId: string; buyer: Address; identity: { chainId: number; tokenId: string }; content: ReviewContent }): VerifiedReview {
  return {
    chainId: BOARD_CHAIN_ID,
    jobId: input.jobId,
    agentChainId: input.identity.chainId,
    agentTokenId: input.identity.tokenId,
    buyer: getAddress(input.buyer),
    ...input.content,
    comment: input.content.comment.trim(),
    signature: '0x',
    updatedAt: new Date(0).toISOString(),
  };
}

/** Why a job cannot be reviewed on the board from this wallet, before the board is even asked. */
function refusal(input: { chainId: number; jobId: string; wallet: Address; job: ReviewedJob; identity: { chainId: number; tokenId: string } | null }): Refusal | null {
  if (input.chainId !== BOARD_CHAIN_ID) return { ok: false, status: 409, error: 'PokterBoard records reviews of jobs funded on BNB Smart Chain mainnet (56).' };
  if (!reviewableJob(input.job.statusName, input.job.submittedAt)) {
    const ended = (ENDED_JOB_STATUSES as readonly string[]).includes(input.job.statusName);
    return { ok: false, status: 409, error: ended ? `The agent delivered nothing on job #${input.jobId}, so it cannot be reviewed.` : `Job #${input.jobId} has not ended yet: it can be reviewed once it is settled, rejected or refunded.` };
  }
  if (getAddress(input.job.client) !== getAddress(input.wallet)) return { ok: false, status: 403, error: `Only the wallet that funded job #${input.jobId} can review it.` };
  if (!input.identity) return { ok: false, status: 409, error: `Job #${input.jobId} was not hired through Pokter, so Pokter cannot say which agent it reviews.` };
  return null;
}

export async function prepareBoardReview(input: {
  chainId: number;
  jobId: string;
  wallet: Address;
  content: ReviewContent;
  board: Address;
  job: ReviewedJob;
  identity: { chainId: number; tokenId: string } | null;
  holdsAgentId: (wallet: Address) => Promise<boolean>;
  simulate: (review: VerifiedReview) => Promise<{ ok: true } | { ok: false; reason: string }>;
}): Promise<{ ok: true; call: { to: Address; value: '0'; data: Hex }; expect: string } | Refusal> {
  const refused = refusal(input);
  if (refused) return refused;
  if (!(await input.holdsAgentId(input.wallet))) {
    return { ok: false, status: 409, error: 'This wallet holds no Agent ID, and PokterBoard takes reviews only from Agent ID holders. One can be claimed in the Binance App (Web3 wallet, then Agent ID).' };
  }
  const review = asReview({ jobId: input.jobId, buyer: input.wallet, identity: input.identity!, content: input.content });
  const verdict = await input.simulate(review);
  if (!verdict.ok) return { ok: false, status: 409, error: verdict.reason };
  const call = boardReviewCall(review, input.board);
  const answers = [
    review.deliveredAsPromised ? 'delivered as promised' : 'not delivered as promised',
    review.speed === 'on-time' ? 'on time' : review.speed,
    review.wouldHireAgain ? 'would hire again' : 'would not hire again',
  ].join(', ');
  return {
    ok: true,
    call: { to: call.address, value: '0', data: encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args }) },
    expect: `Records a ${review.rating}-star review of job #${input.jobId} on PokterBoard ${input.board} from this wallet: ${answers}.${review.comment ? ' The comment is recorded as its hash; its text goes to Pokter next.' : ''} It counts as this person's rating of the agent, replacing any earlier one. No money moves.`,
  };
}

/**
 * Whether a sent transaction is this buyer's board review of this job with
 * exactly this content, and the review as Pokter stores it when it is.
 */
export function verifyBoardReview(input: {
  chainId: number;
  jobId: string;
  content: ReviewContent;
  board: Address;
  job: ReviewedJob;
  identity: { chainId: number; tokenId: string } | null;
  tx: { from: Address; to: Address | null; input: Hex; succeeded: boolean };
  now?: Date;
}): { ok: true; review: VerifiedReview } | Refusal {
  const refused = refusal({ ...input, wallet: input.tx.from });
  if (refused) return refused;
  if (!input.tx.succeeded) return { ok: false, status: 409, error: 'The transaction failed on chain, so nothing was recorded on PokterBoard.' };
  const review = asReview({ jobId: input.jobId, buyer: input.job.client, identity: input.identity!, content: input.content });
  const match = matchesBoardReview(review, input.tx, input.board);
  if (!match.ok) return { ok: false, status: 409, error: match.reason };
  return { ok: true, review: { ...review, updatedAt: (input.now ?? new Date()).toISOString(), proof: 'board' } };
}
