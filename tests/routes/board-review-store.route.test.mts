import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { VerifiedReview } from '../../src/lib/reviews/model';

/*
 * A review its buyer wrote on PokterBoard is stored beside signed ones,
 * marked by its proof: it replaces a signed review of the same job, since
 * the board's record is what the rating counts, and is never replaced.
 */

process.env.REVIEW_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pokter-board-reviews-')), 'reviews.db');
const { getReviewStore } = await import('../../src/lib/reviews/store');

const signed: VerifiedReview = {
  chainId: 56, jobId: '57301', agentChainId: 56, agentTokenId: '1220', buyer: '0x7751bE7B2BA4141D5E32Ef14e9E5cc73e9D7bf0C',
  rating: 5, deliveredAsPromised: true, speed: 'early', wouldHireAgain: true, comment: 'Signed in the browser.', signature: '0x1234', updatedAt: '2026-11-25T10:00:00.000Z',
};
const onBoard = { ...signed, rating: 3, speed: 'late' as const, comment: 'Written from the wallet.', signature: '0x' as const, updatedAt: '2026-11-25T11:00:00.000Z', boardTx: `0x${'aa'.repeat(32)}` };

test('a signed review reads as signed', () => {
  getReviewStore().upsert(signed);
  const stored = getReviewStore().get(56, '57301');
  assert.equal(stored?.proof, 'signature');
  assert.equal(stored?.boardTx, null);
});

test('the board’s review replaces it, proved by its transaction', () => {
  getReviewStore().saveBoardReview(onBoard);
  const stored = getReviewStore().get(56, '57301')!;
  assert.deepEqual(
    { proof: stored.proof, rating: stored.rating, speed: stored.speed, comment: stored.comment, signature: stored.signature, boardTx: stored.boardTx },
    { proof: 'board', rating: 3, speed: 'late', comment: 'Written from the wallet.', signature: '0x', boardTx: onBoard.boardTx },
  );
  assert.equal(getReviewStore().byAgent(56, '1220').length, 1, 'one review per job');
});

test('a board review is never replaced, by the board or by a signature', () => {
  getReviewStore().saveBoardReview({ ...onBoard, rating: 1, boardTx: `0x${'bb'.repeat(32)}` });
  assert.equal(getReviewStore().get(56, '57301')!.rating, 3);
  assert.equal(getReviewStore().get(56, '57301')!.boardTx, onBoard.boardTx);
});

test('a board review of a job with no signed review is stored on its own', () => {
  getReviewStore().saveBoardReview({ ...onBoard, jobId: '57302' });
  assert.equal(getReviewStore().get(56, '57302')?.proof, 'board');
});
