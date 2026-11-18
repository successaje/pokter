import type { Address, Hex } from 'viem';

export const REVIEW_SPEEDS = ['early', 'on-time', 'late'] as const;
export type ReviewSpeed = (typeof REVIEW_SPEEDS)[number];

export interface VerifiedReview {
  chainId: number;
  jobId: string;
  agentChainId: number;
  agentTokenId: string;
  buyer: Address;
  rating: number;
  deliveredAsPromised: boolean;
  speed: ReviewSpeed;
  wouldHireAgain: boolean;
  comment: string;
  signature: Hex;
  updatedAt: string;
  visibility?: 'published' | 'hidden';
  /** The ERC-8004 feedback transaction, once the buyer published the review on chain. */
  onchainTx?: Hex | null;
  /** The chain that transaction is on: the agent's registry chain. */
  onchainChainId?: number | null;
  /** The PokterBoard transaction, once the buyer recorded the review there with their Agent ID (`lib/board`). */
  boardTx?: Hex | null;
}

/** The escrow statuses a job has ended in: settled, rejected by its evaluator, or refunded after its deadline. */
export const ENDED_JOB_STATUSES = ['COMPLETED', 'REJECTED', 'EXPIRED'] as const;

/**
 * Whether a job can be reviewed: it has ended, and the agent delivered
 * something. The same rule as PokterBoard's `review`, so any review Pokter
 * accepts can also be recorded there.
 *
 * A client can fund a job naming any agent without its agreement, let it
 * lapse and take the money back, so a job with nothing delivered may be one
 * the agent never saw. A rejected or refunded job the agent did deliver is
 * where a review says the most.
 */
export function reviewableJob(status: string, submittedAt: bigint | number): boolean {
  return (ENDED_JOB_STATUSES as readonly string[]).includes(status) && BigInt(submittedAt) > 0n;
}

export const REVIEW_REPORT_REASONS =['spam', 'harassment', 'personal-information', 'unrelated', 'other'] as const;
export type ReviewReportReason = (typeof REVIEW_REPORT_REASONS)[number];

export interface ReviewContent {
  rating: number;
  deliveredAsPromised: boolean;
  speed: ReviewSpeed;
  wouldHireAgain: boolean;
  comment: string;
}

export function reviewMessage(input: {
  chainId: number;
  jobId: string;
  agentChainId: number;
  agentTokenId: string;
  content: ReviewContent;
}): string {
  return [
    'Pokter verified job review',
    `Escrow chain: ${input.chainId}`,
    `ERC-8183 job: ${input.jobId}`,
    `Agent identity: ${input.agentChainId}:${input.agentTokenId}`,
    `Rating: ${input.content.rating}/5`,
    `Delivered as promised: ${input.content.deliveredAsPromised ? 'yes' : 'no'}`,
    `Delivery speed: ${input.content.speed}`,
    `Would hire again: ${input.content.wouldHireAgain ? 'yes' : 'no'}`,
    `Comment: ${input.content.comment.trim() || '(none)'}`,
  ].join('\n');
}

export function validReviewContent(value: unknown): value is ReviewContent {
  if (!value || typeof value !== 'object') return false;
  const review = value as Partial<ReviewContent>;
  return (
    Number.isInteger(review.rating) &&
    Number(review.rating) >= 1 &&
    Number(review.rating) <= 5 &&
    typeof review.deliveredAsPromised === 'boolean' &&
    REVIEW_SPEEDS.includes(review.speed as ReviewSpeed) &&
    typeof review.wouldHireAgain === 'boolean' &&
    typeof review.comment === 'string' &&
    review.comment.trim().length <= 500
  );
}
