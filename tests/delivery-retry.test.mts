import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRetryDelivery } from '../src/lib/erc8183/delivery-eligibility';

const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
const soon = NOW + 36 * 3600_000;
const past = NOW - 3600_000;

/**
 * Whether a funded job gets delivered a second time.
 *
 * The case this exists for: our own seller delivered jobs #1366, #1368 and
 * #1375 and failed on #1364, #1365 and #1372 — same seller, same capability,
 * differing only in whether one client-side notification landed.
 */

test('a funded, unexpired job of ours is retried', () => {
  assert.deepEqual(
    shouldRetryDelivery(
      { statusName: 'FUNDED', expiredAtMs: soon, providerIsOurSeller: true },
      NOW,
    ),
    { retry: true },
  );
});

test('an expired escrow is left for the buyer to reclaim', () => {
  // Delivering into one spends gas on a transaction the contract refuses,
  // and the money should go back rather than buy anything.
  const d = shouldRetryDelivery(
    { statusName: 'FUNDED', expiredAtMs: past, providerIsOurSeller: true },
    NOW,
  );
  assert.equal(d.retry, false);
  assert.match((d as { reason: string }).reason, /reclaim/);
});

test('another agent\'s job is never delivered on its behalf', () => {
  const d = shouldRetryDelivery(
    { statusName: 'FUNDED', expiredAtMs: soon, providerIsOurSeller: false },
    NOW,
  );
  assert.equal(d.retry, false);
});

test('a job that already moved on is not delivered twice', () => {
  for (const statusName of ['SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED', 'OPEN']) {
    const d = shouldRetryDelivery(
      { statusName, expiredAtMs: soon, providerIsOurSeller: true },
      NOW,
    );
    assert.equal(d.retry, false, `${statusName} should not be delivered`);
  }
});

test('expiry is decided on the passed clock, not the wall clock', () => {
  // The caller supplies `now` so this stays testable and so a render never
  // reads the clock mid-pass.
  const job = { statusName: 'FUNDED', expiredAtMs: NOW + 1000, providerIsOurSeller: true };
  assert.equal(shouldRetryDelivery(job, NOW).retry, true);
  assert.equal(shouldRetryDelivery(job, NOW + 2000).retry, false);
});
