import { decodeFunctionData, getAddress, keccak256, parseAbi, parseEventLogs, stringToBytes, zeroHash, type Address, type Hex, type Log } from 'viem';

import type { ReviewContent, ReviewSpeed, VerifiedReview } from '@/lib/reviews/model';

/**
 * PokterBoard: reviews from Agent ID holders, recorded on chain.
 *
 * Only the wallet that funded an escrow job may review it there, once,
 * after the agent delivered and the job ended, and only while it holds an
 * Agent ID. Each holder counts once per agent: their latest review is their
 * rating of it. The contract checks all of that itself, so a rating on the
 * board is evidence nobody has to take Pokter's word for.
 *
 * Shared by the browser, which writes a review, and the server, which
 * checks the transaction and reads the board. Nothing here is server-only.
 */

/** Where the board lives: the chain of the Agent ID registry and of the mainnet escrow it reads. */
export const BOARD_CHAIN_ID = 56 as const;

/** The Agent ID registry on BNB Smart Chain: one non-transferable token per Binance Wallet user. */
export const AGENT_ID_REGISTRY: Address = '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F';

/**
 * How many distinct holders must have rated an agent before the rating
 * moves its score: as many as the buyer wallets "Proven in use" asks for,
 * so one or two opinions never swing it.
 */
export const BOARD_RATING_MIN_REVIEWERS = 3;

export const AGENT_ID_ABI = parseAbi(['function balanceOf(address owner) view returns (uint256)']);

export const BOARD_ABI = parseAbi([
  'function review(uint256 jobId, uint8 rating, uint8 flags, bytes32 commentHash)',
  'function reviewed(uint256 jobId) view returns (bool)',
  'function ratingOf(address provider) view returns (uint64 reviewers, uint64 stars)',
  'function ratingFrom(address provider, address reviewer) view returns (uint8)',
  'event Reviewed(uint256 indexed jobId, address indexed provider, address indexed reviewer, uint8 rating, uint8 flags, bytes32 commentHash)',
  'error NotAgentIdHolder()',
  'error RatingOutOfRange()',
  'error FlagsOutOfRange()',
  'error AlreadyReviewed()',
  'error NotJobClient()',
  'error SelfReview()',
  'error UnpaidJob()',
  'error JobNotEnded(uint8 status)',
  'error NothingDelivered()',
  'function postRequest(bytes32 briefHash, uint64 expiresAt) returns (uint256 requestId)',
  'function closeRequest(uint256 requestId)',
  'function requests(uint256 requestId) view returns (address poster, uint64 expiresAt, bool closed)',
  'event RequestPosted(uint256 indexed requestId, address indexed poster, bytes32 briefHash, uint64 expiresAt)',
  'event RequestClosed(uint256 indexed requestId)',
  'error EmptyBrief()',
  'error ExpiryNotInFuture()',
  'error NotRequestPoster()',
  'error RequestAlreadyClosed()',
]);

/** Why the board refuses a call, in words its sender can act on. */
export const BOARD_REFUSAL: Record<string, string> = {
  NotAgentIdHolder: 'The wallet that funded this job holds no Agent ID.',
  RatingOutOfRange: 'A rating is 1 to 5 stars.',
  FlagsOutOfRange: 'The review’s answers could not be encoded.',
  AlreadyReviewed: 'This job is already reviewed on PokterBoard.',
  NotJobClient: 'Only the wallet that funded this job can record its review.',
  SelfReview: 'An agent cannot review its own job.',
  UnpaidJob: 'A job with no budget cannot be reviewed.',
  JobNotEnded: 'The job has not ended on the escrow yet.',
  NothingDelivered: 'The agent delivered nothing on this job, so it cannot be reviewed.',
  EmptyBrief: 'The request has no text to post.',
  ExpiryNotInFuture: 'The request has stopped taking proposals, so it cannot be posted.',
  NotRequestPoster: 'Only the wallet that posted this request on PokterBoard can close it there.',
  RequestAlreadyClosed: 'This request is already closed on PokterBoard.',
};

/* Bits 2-3 of `flags`; 0 means the reviewer did not say. */
const SPEED_BITS: Record<ReviewSpeed, number> = { early: 1, 'on-time': 2, late: 3 };
const SPEED_OF_BITS: Record<number, ReviewSpeed> = { 1: 'early', 2: 'on-time', 3: 'late' };

/** A review's answers as the board's flags: bit 0 delivered as promised, bit 1 would hire again, bits 2-3 speed. */
export function reviewFlags(content: Pick<ReviewContent, 'deliveredAsPromised' | 'wouldHireAgain' | 'speed'>): number {
  return (content.deliveredAsPromised ? 1 : 0) | (content.wouldHireAgain ? 2 : 0) | (SPEED_BITS[content.speed] << 2);
}

/** The board's flags as a review's answers. Speed is null when the reviewer did not give one. */
export function flagsContent(flags: number): { deliveredAsPromised: boolean; wouldHireAgain: boolean; speed: ReviewSpeed | null } {
  return { deliveredAsPromised: (flags & 1) === 1, wouldHireAgain: (flags & 2) === 2, speed: SPEED_OF_BITS[(flags >> 2) & 3] ?? null };
}

/**
 * The hash the board records for a comment: keccak256 of its UTF-8 text,
 * trimmed as Pokter stores it, or zero for none. Anyone can attach the text
 * later, and it is shown only if it hashes to what the reviewer recorded.
 */
export function commentHash(comment: string): Hex {
  const text = comment.trim();
  return text ? keccak256(stringToBytes(text)) : zeroHash;
}

/** The exact call the buyer's wallet makes to record a Pokter review on the board. */
export function boardReviewCall(review: Pick<VerifiedReview, 'jobId' | 'rating' | 'deliveredAsPromised' | 'wouldHireAgain' | 'speed' | 'comment'>, board: Address) {
  return {
    address: board,
    abi: BOARD_ABI,
    functionName: 'review' as const,
    args: [BigInt(review.jobId), review.rating, reviewFlags(review), commentHash(review.comment)] as const,
    chainId: BOARD_CHAIN_ID,
  };
}

/**
 * Whether a transaction records this review on the board. Checked from the
 * transaction itself: sent by the review's buyer, to the board, calling
 * `review` for this job with this review's stars, answers and comment.
 * Whether the board accepted it is the receipt's status, which the caller reads.
 */
export function matchesBoardReview(
  review: VerifiedReview,
  tx: { from: Address; to: Address | null; input: Hex },
  board: Address,
): { ok: true } | { ok: false; reason: string } {
  if (review.chainId !== BOARD_CHAIN_ID) return { ok: false, reason: 'PokterBoard records reviews of BNB Smart Chain mainnet jobs only.' };
  if (!tx.to || getAddress(tx.to) !== getAddress(board)) return { ok: false, reason: 'The transaction was not sent to PokterBoard.' };
  if (getAddress(tx.from) !== getAddress(review.buyer)) return { ok: false, reason: 'The transaction was not sent by the buyer who wrote the review.' };
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: BOARD_ABI, data: tx.input });
  } catch {
    return { ok: false, reason: 'The transaction is not a PokterBoard review.' };
  }
  if (decoded.functionName !== 'review') return { ok: false, reason: 'The transaction is not a PokterBoard review.' };
  const [jobId, rating, flags, hash] = decoded.args;
  if (jobId !== BigInt(review.jobId)) return { ok: false, reason: 'The transaction reviews a different job.' };
  if (rating !== review.rating || flags !== reviewFlags(review)) return { ok: false, reason: 'The recorded rating does not match the review.' };
  if (hash !== commentHash(review.comment)) return { ok: false, reason: 'The recorded comment does not match the review.' };
  return { ok: true };
}

/** The provider wallet a confirmed board review rated, from its receipt's `Reviewed` log; null when it has none. */
export function reviewedProvider(logs: Log[], board: Address): Address | null {
  const events = parseEventLogs({ abi: BOARD_ABI, eventName: 'Reviewed', logs }).filter((log) => getAddress(log.address) === getAddress(board));
  return events[0] ? getAddress(events[0].args.provider) : null;
}
