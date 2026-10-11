import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeFunctionData } from 'viem';

import { feedbackCall, feedbackDocument, feedbackHash, feedbackUri, matchesFeedback, REPUTATION_ABI, REPUTATION_REGISTRY, scoreOf } from '../src/lib/reviews/onchain';
import type { VerifiedReview } from '../src/lib/reviews/model';

const review: VerifiedReview = {
  chainId: 97,
  jobId: '1424',
  agentChainId: 97,
  agentTokenId: '2554',
  buyer: '0x60eF148485C2a5119fa52CA13c52E9fd98F28e87',
  rating: 5,
  deliveredAsPromised: true,
  speed: 'early',
  wouldHireAgain: false,
  comment: 'Did quite well',
  signature: '0xabc',
  updatedAt: '2026-10-10T17:58:28.041Z',
};
const ORIGIN = 'https://pokter.xyz';

test('a 1–5 rating becomes a 0–100 score', () => {
  assert.equal(scoreOf(5), 100);
  assert.equal(scoreOf(3), 60);
  assert.equal(scoreOf(1), 20);
});

test('the feedback document is stable and links the agent, buyer and job', () => {
  assert.equal(feedbackDocument(review), feedbackDocument({ ...review }));
  const doc = JSON.parse(feedbackDocument(review));
  assert.equal(doc.agentId, 2554);
  assert.equal(doc.agentRegistry, 'eip155:97:0x8004A818BFB912233c491871b3d84c89A494BD9e');
  assert.equal(doc.value, 100);
  assert.equal(doc.pokter.job.jobId, '1424');
  assert.notEqual(feedbackHash(review), feedbackHash({ ...review, comment: 'changed' }));
  assert.equal(feedbackUri(ORIGIN, review), 'https://pokter.xyz/api/reviews/97/1424');
});

function txFor(args: ReturnType<typeof feedbackCall>['args'], overrides: Partial<{ from: `0x${string}`; to: `0x${string}` }> = {}) {
  return {
    from: overrides.from ?? review.buyer,
    to: overrides.to ?? REPUTATION_REGISTRY[97],
    input: encodeFunctionData({ abi: REPUTATION_ABI, functionName: 'giveFeedback', args }),
  };
}

test('the call the wallet makes is recognised as this review', () => {
  const call = feedbackCall(review, ORIGIN);
  assert.equal(call.address, REPUTATION_REGISTRY[97]);
  assert.deepEqual(matchesFeedback(review, txFor(call.args), ORIGIN), { ok: true });
});

test('a different sender, registry, agent, score or hash is refused', () => {
  const args = feedbackCall(review, ORIGIN).args;
  assert.equal(matchesFeedback(review, txFor(args, { from: '0x0000000000000000000000000000000000000001' }), ORIGIN).ok, false);
  assert.equal(matchesFeedback(review, txFor(args, { to: REPUTATION_REGISTRY[56] }), ORIGIN).ok, false);
  const other = [...args] as unknown as typeof args;
  (other as unknown as unknown[])[0] = 9999n;
  assert.equal(matchesFeedback(review, txFor(other), ORIGIN).ok, false);
  const lowScore = [...args] as unknown as typeof args;
  (lowScore as unknown as unknown[])[1] = 20n;
  assert.equal(matchesFeedback(review, txFor(lowScore), ORIGIN).ok, false);
  const wrongHash = [...args] as unknown as typeof args;
  (wrongHash as unknown as unknown[])[7] = `0x${'00'.repeat(32)}`;
  assert.equal(matchesFeedback(review, txFor(wrongHash), ORIGIN).ok, false);
});
