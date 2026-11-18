import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeFunctionData, keccak256, stringToBytes, zeroHash, type Address, type Hex } from 'viem';

import { BOARD_ABI, boardReviewCall, commentHash, flagsContent, matchesBoardReview, reviewFlags } from '../src/lib/board/contract';
import type { VerifiedReview } from '../src/lib/reviews/model';

/*
 * A Pokter review, recorded on PokterBoard: the stars and answers in the
 * call, the comment as its hash. These are the encodings the board's
 * README documents, so another app writing to the board means the same.
 */

const BOARD: Address = '0x00000000000000000000000000000000000B0A2D';
const BUYER: Address = '0x7751bE7B2BA4141D5E32Ef14e9E5cc73e9D7bf0C';

const review: VerifiedReview = {
  chainId: 56,
  jobId: '57067',
  agentChainId: 56,
  agentTokenId: '1220',
  buyer: BUYER,
  rating: 4,
  deliveredAsPromised: true,
  speed: 'on-time',
  wouldHireAgain: false,
  comment: 'Right answer, a little slow to explain it.',
  signature: '0x01',
  updatedAt: '2026-11-18T12:00:00.000Z',
};

test('a review’s answers become the board’s flags and back', () => {
  assert.equal(reviewFlags({ deliveredAsPromised: true, wouldHireAgain: true, speed: 'early' }), 0b0111);
  assert.equal(reviewFlags({ deliveredAsPromised: true, wouldHireAgain: false, speed: 'on-time' }), 0b1001);
  assert.equal(reviewFlags({ deliveredAsPromised: false, wouldHireAgain: true, speed: 'late' }), 0b1110);
  for (const speed of ['early', 'on-time', 'late'] as const) {
    for (const deliveredAsPromised of [true, false]) {
      for (const wouldHireAgain of [true, false]) {
        const flags = reviewFlags({ deliveredAsPromised, wouldHireAgain, speed });
        assert.ok(flags <= 0x0f, 'within the four bits the board accepts');
        assert.deepEqual(flagsContent(flags), { deliveredAsPromised, wouldHireAgain, speed });
      }
    }
  }
  // Another app may leave the speed unsaid.
  assert.equal(flagsContent(0b0001).speed, null);
});

test('a comment is recorded as the hash of its trimmed text, and no comment as zero', () => {
  assert.equal(commentHash('  Fast and right.\n'), keccak256(stringToBytes('Fast and right.')));
  assert.equal(commentHash(''), zeroHash);
  assert.equal(commentHash('   '), zeroHash);
});

test('the call carries the job, the stars, the answers and the comment’s hash', () => {
  const call = boardReviewCall(review, BOARD);
  assert.equal(call.address, BOARD);
  assert.equal(call.chainId, 56);
  assert.equal(call.functionName, 'review');
  assert.deepEqual(call.args, [57067n, 4, 0b1001, keccak256(stringToBytes(review.comment))]);
});

function sent(overrides: { from?: Address; to?: Address | null; args?: readonly [bigint, number, number, Hex] } = {}) {
  const args = overrides.args ?? boardReviewCall(review, BOARD).args;
  return {
    from: overrides.from ?? BUYER,
    to: overrides.to === undefined ? BOARD : overrides.to,
    input: encodeFunctionData({ abi: BOARD_ABI, functionName: 'review', args }),
  };
}

test('the buyer’s own call to the board for this review matches', () => {
  assert.deepEqual(matchesBoardReview(review, sent(), BOARD), { ok: true });
  assert.deepEqual(matchesBoardReview(review, { ...sent(), from: BUYER.toLowerCase() as Address }, BOARD), { ok: true });
});

test('a call from someone else, to somewhere else, or saying something else does not match', () => {
  const hash = commentHash(review.comment);
  const cases: Array<[string, ReturnType<typeof sent>]> = [
    ['sent by another wallet', sent({ from: '0xC5A17B5295Fc50BAdB1F9f9C09b412fE5e84F7d3' })],
    ['sent to another contract', sent({ to: '0x0000000000000000000000000000000000000001' })],
    ['a contract creation', sent({ to: null })],
    ['another job', sent({ args: [57068n, 4, 0b1001, hash] })],
    ['other stars', sent({ args: [57067n, 5, 0b1001, hash] })],
    ['other answers', sent({ args: [57067n, 4, 0b1011, hash] })],
    ['another comment', sent({ args: [57067n, 4, 0b1001, zeroHash] })],
  ];
  for (const [label, tx] of cases) {
    const verdict = matchesBoardReview(review, tx, BOARD);
    assert.equal(verdict.ok, false, label);
  }
  const notReview = { from: BUYER, to: BOARD, input: encodeFunctionData({ abi: BOARD_ABI, functionName: 'reviewed', args: [57067n] }) };
  assert.equal(matchesBoardReview(review, notReview, BOARD).ok, false, 'a different function');
});

test('a review of a testnet job is never matched to the mainnet board', () => {
  assert.equal(matchesBoardReview({ ...review, chainId: 97 }, sent(), BOARD).ok, false);
});
