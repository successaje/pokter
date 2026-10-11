import { decodeFunctionData, getAddress, keccak256, parseAbi, stringToBytes, type Address, type Hex } from 'viem';

import { canonicalJson } from '@/lib/erc8183/negotiation';
import type { VerifiedReview } from './model';

/**
 * A Pokter review, published to the ERC-8004 Reputation Registry.
 *
 * The review stays signed and stored by Pokter; publishing adds an entry
 * the whole ecosystem can read. It is written by the buyer's own wallet on
 * the chain where the agent is registered, because the registry records
 * who gave the feedback and refuses it from the agent's owner. The entry
 * links back to the full signed review by URL and by hash.
 *
 * Both addresses were read from chain: each registry reports the identity
 * registry it belongs to, and both are version 2.0.0.
 */
export const REPUTATION_REGISTRY: Record<number, Address> = {
  56: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  97: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
};
export const IDENTITY_REGISTRY: Record<number, Address> = {
  56: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  97: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
};

export const REPUTATION_ABI = parseAbi([
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
]);

/** A 1–5 rating as a 0–100 score, the common scale for a "starred" entry. */
export function scoreOf(rating: number): number {
  return Math.round(Math.min(5, Math.max(1, rating)) * 20);
}

export const FEEDBACK_TAG1 = 'starred';
export const FEEDBACK_TAG2 = 'pokter';

/** Where the full review lives, as the feedback URI. */
export function feedbackUri(origin: string, review: Pick<VerifiedReview, 'chainId' | 'jobId'>): string {
  return `${origin.replace(/\/$/, '')}/api/reviews/${review.chainId}/${review.jobId}`;
}

/**
 * The document the on-chain entry points at, as exact text. Canonical JSON,
 * so the hash is the same however the fields are ordered, and built only
 * from the stored, signed review, so it does not change unless the review
 * does.
 */
export function feedbackDocument(review: VerifiedReview): string {
  return canonicalJson({
    agentRegistry: `eip155:${review.agentChainId}:${IDENTITY_REGISTRY[review.agentChainId] ?? ''}`,
    agentId: Number(review.agentTokenId),
    clientAddress: `eip155:${review.chainId}:${review.buyer}`,
    createdAt: review.updatedAt,
    value: scoreOf(review.rating),
    valueDecimals: 0,
    tag1: FEEDBACK_TAG1,
    tag2: FEEDBACK_TAG2,
    pokter: {
      job: { chainId: review.chainId, jobId: review.jobId },
      rating: review.rating,
      deliveredAsPromised: review.deliveredAsPromised,
      speed: review.speed,
      wouldHireAgain: review.wouldHireAgain,
      comment: review.comment,
      buyerSignature: review.signature,
    },
  });
}

export function feedbackHash(review: VerifiedReview): Hex {
  return keccak256(stringToBytes(feedbackDocument(review)));
}

/** The exact call the buyer's wallet makes. */
export function feedbackCall(review: VerifiedReview, origin: string) {
  return {
    address: REPUTATION_REGISTRY[review.agentChainId],
    abi: REPUTATION_ABI,
    functionName: 'giveFeedback' as const,
    args: [BigInt(review.agentTokenId), BigInt(scoreOf(review.rating)), 0, FEEDBACK_TAG1, FEEDBACK_TAG2, '', feedbackUri(origin, review), feedbackHash(review)] as const,
    chainId: review.agentChainId,
  };
}

/**
 * Whether a transaction is this review, published by its buyer. Checked
 * from the transaction itself, not from anything the caller says: sent by
 * the buyer, to the registry on the agent's chain, calling giveFeedback for
 * this agent with this review's score and hash.
 */
export function matchesFeedback(
  review: VerifiedReview,
  tx: { from: Address; to: Address | null; input: Hex },
  origin: string,
): { ok: true } | { ok: false; reason: string } {
  const registry = REPUTATION_REGISTRY[review.agentChainId];
  if (!registry || !tx.to || getAddress(tx.to) !== getAddress(registry)) return { ok: false, reason: 'The transaction was not sent to the reputation registry.' };
  if (getAddress(tx.from) !== getAddress(review.buyer)) return { ok: false, reason: 'The transaction was not sent by the buyer who wrote the review.' };
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: REPUTATION_ABI, data: tx.input });
  } catch {
    return { ok: false, reason: 'The transaction is not a feedback call.' };
  }
  const [agentId, value, decimals, , , , uri, hash] = decoded.args;
  if (agentId !== BigInt(review.agentTokenId)) return { ok: false, reason: 'The feedback is for a different agent.' };
  if (value !== BigInt(scoreOf(review.rating)) || decimals !== 0) return { ok: false, reason: 'The feedback score does not match the review.' };
  if (hash !== feedbackHash(review) || uri !== feedbackUri(origin, review)) return { ok: false, reason: 'The feedback does not point at this review.' };
  return { ok: true };
}
