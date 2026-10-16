import assert from 'node:assert/strict';
import test from 'node:test';

import { jobPhase, PHASE } from '../src/features/workspace/phase';
import type { HiredJob } from '../src/lib/erc8183/types';

const now = Date.now();
const past = new Date(now - 86_400_000).toISOString();
const future = new Date(now + 86_400_000).toISOString();
const job = (over: Partial<HiredJob>) => ({ status: 'SUBMITTED', expiredAt: future, reclaimTxHash: null, disputeTxHash: null, ...over }) as HiredJob;

test('an open dispute waits on the voters and does not ask the buyer to review', () => {
  const phase = jobPhase(job({ disputeTxHash: '0xd15' }), now);
  assert.equal(phase, 'disputed');
  assert.equal(PHASE[phase].needsYou, false);
  assert.equal(jobPhase(job({}), now), 'review');
});

test('a dispute that missed its quorum by the deadline offers the reclaim', () => {
  const phase = jobPhase(job({ disputeTxHash: '0xd15', expiredAt: past }), now);
  assert.equal(phase, 'reclaim');
  assert.equal(PHASE[phase].needsYou, true);
});

test('a job rejected by the vote reads as rejected with a refund, not as a dispute still open', () => {
  assert.equal(jobPhase(job({ status: 'REJECTED', disputeTxHash: '0xd15' }), now), 'rejected');
  assert.match(PHASE.rejected.next, /not paid/);
  assert.equal(jobPhase(job({ status: 'REJECTED', reclaimTxHash: '0xr' }), now), 'refunded');
});
