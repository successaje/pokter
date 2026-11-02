import assert from 'node:assert/strict';
import test from 'node:test';

import { isReclaimable } from '../src/lib/erc8183/reclaim-gate';
import { assertRefundEligible } from '../src/lib/erc8183/reclaim-check';

const past = new Date(Date.now() - 86_400_000).toISOString();
const future = new Date(Date.now() + 86_400_000).toISOString();
const now = Date.now();

test('a FUNDED job past its expiry is reclaimable', () => {
  // The real shape: #1363-#1365 and #1371-#1373 are all FUNDED and expired.
  assert.equal(isReclaimable({ status: 'FUNDED', expiredAt: past }, now), true);
});

test('a job the kernel has marked EXPIRED has already been refunded', () => {
  assert.equal(isReclaimable({ status: 'EXPIRED', expiredAt: past }, now), false);
});

test('an unexpired job is not reclaimable, however quiet the agent is', () => {
  assert.equal(isReclaimable({ status: 'FUNDED', expiredAt: future }, now), false);
});

test('a settled or never-funded job is never reclaimable', () => {
  for (const status of ['COMPLETED', 'REJECTED', 'OPEN']) {
    assert.equal(
      isReclaimable({ status, expiredAt: past }, now),
      false,
      `${status} should not offer reclaim`,
    );
  }
});

test('an escrow already reclaimed is not offered again', () => {
  assert.equal(
    isReclaimable({ status: 'FUNDED', expiredAt: past, reclaimTxHash: '0xabc' }, now),
    false,
  );
});

test('an unsettled delivery is reclaimable at its deadline, with or without a dispute', () => {
  const disputed = { status: 'SUBMITTED', expiredAt: past, disputeTxHash: '0xd15' };
  assert.equal(isReclaimable(disputed, now), true);
  // Before the deadline the vote is still open.
  assert.equal(isReclaimable({ ...disputed, expiredAt: new Date(now + 60_000).toISOString() }, now), false);
  assert.equal(isReclaimable({ status: 'SUBMITTED', expiredAt: past }, now), true);
});

test('live escrow preflight accepts only the funder and an expired funded or submitted job', () => {
  const client = '0x0000000000000000000000000000000000000001';
  const other = '0x0000000000000000000000000000000000000002';
  const expiredAt = BigInt(Math.floor(now / 1000) - 1);
  for (const statusName of ['FUNDED', 'SUBMITTED']) {
    assert.doesNotThrow(() => assertRefundEligible({ client, statusName, expiredAt }, client, now));
  }
  assert.throws(() => assertRefundEligible({ client, statusName: 'FUNDED', expiredAt }, other, now), /did not fund/);
  assert.throws(() => assertRefundEligible({ client, statusName: 'FUNDED', expiredAt: expiredAt + 86_400n }, client, now), /not expired/);
  for (const statusName of ['OPEN', 'COMPLETED', 'REJECTED', 'EXPIRED']) {
    assert.throws(() => assertRefundEligible({ client, statusName, expiredAt }, client, now), /no escrow left/);
  }
});
