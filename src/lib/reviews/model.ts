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
}

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
