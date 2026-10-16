import assert from 'node:assert/strict';
import test from 'node:test';

import { isReclaimable } from '../src/lib/erc8183/reclaim-gate';

const past = new Date(Date.now() - 86_400_000).toISOString();
const future = new Date(Date.now() + 86_400_000).toISOString();
const now = Date.now();

test('a FUNDED job past its expiry is reclaimable', () => {
  // The real shape: #1363-#1365 and #1371-#1373 are all FUNDED and expired.
  assert.equal(isReclaimable({ status: 'FUNDED', expiredAt: past }, now), true);
});

test('a job the kernel has marked EXPIRED is reclaimable too', () => {
  assert.equal(isReclaimable({ status: 'EXPIRED', expiredAt: past }, now), true);
});

test('an unexpired job is not reclaimable, however quiet the agent is', () => {
  assert.equal(isReclaimable({ status: 'FUNDED', expiredAt: future }, now), false);
});

test('a delivered or settled job is never reclaimable', () => {
  for (const status of ['SUBMITTED', 'COMPLETED', 'REJECTED', 'OPEN']) {
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

test('a disputed delivery is reclaimable once its deadline passes without a quorum', () => {
  const disputed = { status: 'SUBMITTED', expiredAt: past, disputeTxHash: '0xd15' };
  assert.equal(isReclaimable(disputed, now), true);
  // Before the deadline the vote is still open.
  assert.equal(isReclaimable({ ...disputed, expiredAt: new Date(now + 60_000).toISOString() }, now), false);
  // An undisputed delivery is the agent's once its window passes, never the buyer's.
  assert.equal(isReclaimable({ status: 'SUBMITTED', expiredAt: past }, now), false);
});
