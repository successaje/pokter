import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeFunctionData, encodeFunctionData, keccak256, stringToBytes, type Address } from 'viem';

import { prepareBoardReview, verifyBoardReview, type ReviewedJob } from '../src/lib/board/agent-review';
import { BOARD_ABI } from '../src/lib/board/contract';
import type { ReviewContent } from '../src/lib/reviews/model';

/*
 * A review written on PokterBoard by a wallet that signs typed data only.
 * Pokter returns the call once the board would take it, and shows the
 * review only once the sent transaction says exactly what the buyer gave.
 */

const BOARD: Address = '0x00000000000000000000000000000000000B0a2D';
const BUYER: Address = '0x7751bE7B2BA4141D5E32Ef14e9E5cc73e9D7bf0C';
const OTHER: Address = '0xC5A17B5295Fc50BAdB1F9f9C09b412fE5e84F7d3';
const job: ReviewedJob = { client: BUYER, provider: '0x81762d5214fCB6fB3b102beF9D69d13A56c1a2d0', statusName: 'COMPLETED', submittedAt: 1_792_844_269n };
const identity = { chainId: 56, tokenId: '1220' };
const content: ReviewContent = { rating: 4, deliveredAsPromised: true, speed: 'on-time', wouldHireAgain: true, comment: '  Clear and on time.  ' };

const base: Parameters<typeof prepareBoardReview>[0] = {
  chainId: 56,
  jobId: '57301',
  wallet: BUYER,
  content,
  board: BOARD,
  job,
  identity,
  holdsAgentId: async () => true,
  simulate: async () => ({ ok: true }),
};

test('the call records exactly this review: the job, the stars, the answers and the trimmed comment’s hash', async () => {
  const result = await prepareBoardReview(base);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.call.to, BOARD);
  assert.equal(result.call.value, '0');
  const { functionName, args } = decodeFunctionData({ abi: BOARD_ABI, data: result.call.data });
  assert.equal(functionName, 'review');
  assert.deepEqual(args, [57301n, 4, 0b1011, keccak256(stringToBytes('Clear and on time.'))]);
  assert.match(result.expect, /4-star review of job #57301 on PokterBoard .*delivered as promised, on time, would hire again\. The comment is recorded as its hash/);
  assert.match(result.expect, /No money moves\.$/);
});

test('nothing is returned for a job the wallet cannot review, each refusal in its own words', async () => {
  const cases: Array<[string, Partial<typeof base>, RegExp]> = [
    ['testnet', { chainId: 97 }, /mainnet/],
    ['still funded', { job: { ...job, statusName: 'FUNDED' } }, /has not ended yet/],
    ['refunded with nothing delivered', { job: { ...job, statusName: 'EXPIRED', submittedAt: 0n } }, /delivered nothing/],
    ['another wallet', { wallet: OTHER }, /Only the wallet that funded job #57301/],
    ['not a Pokter hire', { identity: null }, /not hired through Pokter/],
    ['no Agent ID', { holdsAgentId: async () => false }, /holds no Agent ID.*Binance App/],
    ['the board refuses', { simulate: async () => ({ ok: false as const, reason: 'This job is already reviewed on PokterBoard.' }) }, /already reviewed/],
  ];
  for (const [label, change, said] of cases) {
    const result = await prepareBoardReview({ ...base, ...change });
    assert.equal(result.ok, false, label);
    if (!result.ok) assert.match(result.error, said, label);
  }
});

function sent(args: readonly [bigint, number, number, `0x${string}`], from: Address = BUYER, succeeded = true) {
  return { from, to: BOARD, input: encodeFunctionData({ abi: BOARD_ABI, functionName: 'review', args }), succeeded };
}
const recorded = [57301n, 4, 0b1011, keccak256(stringToBytes('Clear and on time.'))] as const;
const now = new Date('2026-11-26T09:00:00Z');

test('the buyer’s board transaction with this content becomes the review Pokter shows, proved by the board', () => {
  const result = verifyBoardReview({ chainId: 56, jobId: '57301', content, board: BOARD, job, identity, tx: sent(recorded), now });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    { buyer: result.review.buyer, rating: result.review.rating, comment: result.review.comment, proof: result.review.proof, agent: `${result.review.agentChainId}:${result.review.agentTokenId}`, at: result.review.updatedAt },
    { buyer: BUYER, rating: 4, comment: 'Clear and on time.', proof: 'board', agent: '56:1220', at: '2026-11-26T09:00:00.000Z' },
  );
});

test('a transaction from another wallet, a failed one, or one saying something else shows nothing', () => {
  const verify = (tx: ReturnType<typeof sent>, c: ReviewContent = content) => verifyBoardReview({ chainId: 56, jobId: '57301', content: c, board: BOARD, job, identity, tx, now });
  assert.equal(verify(sent(recorded, OTHER)).ok, false, 'not the funder');
  assert.equal(verify(sent(recorded, BUYER, false)).ok, false, 'failed on chain');
  assert.equal(verify(sent([57301n, 5, 0b1011, recorded[3]])).ok, false, 'other stars than the buyer gave Pokter');
  assert.equal(verify(sent(recorded), { ...content, comment: 'A kinder comment, swapped in later.' }).ok, false, 'a comment that is not the one hashed');
  assert.equal(verify(sent([57302n, 4, 0b1011, recorded[3]])).ok, false, 'another job');
});
