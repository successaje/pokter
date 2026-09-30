import assert from 'node:assert/strict';
import test from 'node:test';

import { privateKeyToAccount } from 'viem/accounts';
import { verifyMessage } from 'viem';

import { reviewMessage, validReviewContent } from '../src/lib/reviews/model.js';

const content = {
  rating: 5,
  deliveredAsPromised: true,
  speed: 'on-time' as const,
  wouldHireAgain: true,
  comment: 'Clear result.',
};

test('a review signature commits to the job, agent and structured outcome', async () => {
  const account = privateKeyToAccount(`0x${'11'.repeat(32)}`);
  const message = reviewMessage({ chainId: 97, jobId: '1372', agentChainId: 56, agentTokenId: '265375', content });
  const signature = await account.signMessage({ message });
  assert.equal(await verifyMessage({ address: account.address, message, signature }), true);
  assert.equal(await verifyMessage({ address: account.address, message: message.replace('1372', '1373'), signature }), false);
});

test('review validation rejects out-of-range ratings and oversized comments', () => {
  assert.equal(validReviewContent(content), true);
  assert.equal(validReviewContent({ ...content, rating: 0 }), false);
  assert.equal(validReviewContent({ ...content, comment: 'x'.repeat(501) }), false);
});
