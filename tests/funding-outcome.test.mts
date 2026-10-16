import assert from 'node:assert/strict';
import test from 'node:test';

import { describeFundingOutcome, fundingOutcome, retrySafe } from '../src/lib/hire/funding-outcome';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const PROVIDER = '0x2222222222222222222222222222222222222222';
const expected = { account: ACCOUNT, provider: PROVIDER, budget: 100n, description: '{"task":"agreed"}' };
const job = (over: Partial<Parameters<typeof fundingOutcome>[0] & object> = {}) => ({
  client: ACCOUNT, provider: PROVIDER, budget: 100n, description: '{"task":"agreed"}', statusName: 'FUNDED', ...over,
});

test('a confirmation timeout on a funding that landed must never be retried', () => {
  /*
   * `wallet_sendCalls` gives up with BATCH_CONFIRMATION_TIMEOUT, which says
   * we stopped watching — not that the money stayed put. Nothing caught it
   * by name, so it reached the buyer as an ordinary error beside a retry.
   */
  assert.equal(fundingOutcome(job(), expected), 'funded');
  assert.equal(retrySafe('funded'), false);
  for (const status of ['SUBMITTED', 'COMPLETED', 'EXPIRED', 'REJECTED']) {
    assert.equal(fundingOutcome(job({ statusName: status }), expected), 'funded', `${status} was still funded by this attempt`);
  }
});

test('nothing at the predicted id means the money did not move', () => {
  assert.equal(fundingOutcome(null, expected), 'not-funded');
  assert.equal(fundingOutcome(job({ client: '0x0000000000000000000000000000000000000000' }), expected), 'not-funded');
  assert.equal(fundingOutcome(job({ statusName: 'CREATED' }), expected), 'not-funded', 'created but never funded');
  assert.equal(retrySafe('not-funded'), true, 'the only case where a retry is safe');
});

test('an id taken by another job is unknown, not failed', () => {
  /*
   * Job ids come from a counter, so a concurrent hire can take the one this
   * attempt predicted. That says nothing about whether our funding landed —
   * it may have landed at a later id — so a retry is not offered.
   */
  const outcome = fundingOutcome(job({ client: '0x9999999999999999999999999999999999999999' }), expected);
  assert.equal(outcome, 'taken');
  assert.equal(retrySafe(outcome), false);
  assert.match(describeFundingOutcome(outcome), /could pay twice/);
});

test('ours but on different terms is shown, not retried past', () => {
  assert.equal(fundingOutcome(job({ budget: 999n }), expected), 'mismatch');
  assert.equal(fundingOutcome(job({ description: '{"task":"something else"}' }), expected), 'mismatch');
  assert.equal(retrySafe('mismatch'), false);
});

test('address comparison ignores case, so a checksum difference is not a mismatch', () => {
  assert.equal(fundingOutcome(job({ client: ACCOUNT.toUpperCase().replace('0X', '0x') }), expected), 'funded');
});

test('every outcome has something to say to the buyer', () => {
  for (const outcome of ['funded', 'not-funded', 'taken', 'mismatch'] as const) {
    assert.ok(describeFundingOutcome(outcome).length > 40, outcome);
  }
});
