import assert from 'node:assert/strict';
import test from 'node:test';

import { coordinationText, reviewCoordination, type ReviewForCoordination } from '../src/lib/proof/coordination';

const r = (author: string | null, createdAt: string | null, independence: ReviewForCoordination['independence'] = 'independent'): ReviewForCoordination => ({ authorAddress: author, independence, createdAt });
const spread = (i: number) => new Date(Date.parse('2026-10-01T00:00:00Z') + i * 86_400_000).toISOString();

test('below two known authors it says it cannot tell', () => {
  assert.equal(reviewCoordination([r('0xa', spread(0)), r(null, spread(1))]).level, 'unknown');
  assert.equal(coordinationText(reviewCoordination([])), 'No on-chain reviews');
});

test('independent reviewers spread over days read as no sign', () => {
  const c = reviewCoordination([r('0xa', spread(0)), r('0xb', spread(3)), r('0xc', spread(9))]);
  assert.equal(c.level, 'none');
  assert.match(coordinationText(c), /funders not checked/);
});

test('five wallets in one hour look coordinated, three are worth a look', () => {
  const hour = (m: number) => new Date(Date.parse('2026-10-01T10:00:00Z') + m * 60_000).toISOString();
  assert.equal(reviewCoordination(['0xa', '0xb', '0xc'].map((a, i) => r(a, hour(i * 10)))).level, 'watch');
  assert.equal(reviewCoordination(['0xa', '0xb', '0xc', '0xd', '0xe'].map((a, i) => r(a, hour(i * 10)))).level, 'coordinated');
});

test('one wallet writing most of the reviews is reported, not called coordination', () => {
  // On BNB Chain this is usually a scoring service or a repeat buyer.
  const c = reviewCoordination([r('0xa', spread(0)), r('0xa', spread(2)), r('0xa', spread(4)), r('0xb', spread(6))]);
  assert.equal(c.level, 'none');
  assert.deepEqual(c.oneReviewer, { count: 3, of: 4 });
  assert.match(coordinationText(c), /^3 of 4 independent reviews are from one reviewer\. No sign of coordination/);
});

test('shared funders, and funding by the owner, are caught when funders are known', () => {
  const reviews = [r('0xa', spread(0)), r('0xb', spread(5)), r('0xc', spread(10))];
  const shared = new Map([['0xa', '0xf'], ['0xb', '0xf'], ['0xc', '0xf']]);
  assert.equal(reviewCoordination(reviews, { funders: shared }).level, 'coordinated');
  const byOwner = new Map([['0xa', '0x0wner'], ['0xb', '0xother'], ['0xc', '0xelse']]);
  const c = reviewCoordination(reviews, { funders: byOwner, owner: '0x0WNER' });
  assert.equal(c.level, 'coordinated');
  assert.match(c.reasons.join(), /funded by the agent's owner/);
});

test('owner and team reviews are already disclosed elsewhere and are not counted here', () => {
  const c = reviewCoordination([r('0xo', spread(0), 'related'), r('0xo', spread(1), 'related'), r('0xo', spread(2), 'related'), r('0xb', spread(3))]);
  assert.equal(c.level, 'none');
});
