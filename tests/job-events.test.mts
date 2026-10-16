import assert from 'node:assert/strict';
import test from 'node:test';

import { releaseAvailable } from '../src/lib/wallet/job-events';

const WINDOW = 900; // the testnet policy's disputeWindow, read from chain
const base = { submittedAt: 1_000_000, expiredAt: 1_000_000 + 86_400, disputeWindowSeconds: WINDOW, status: 'SUBMITTED' };

test('the event fires only once the window the escrow enforces has closed', () => {
  /*
   * The status does not change when a review window opens, so nothing
   * recorded the one moment a buyer can act. And a sweep cannot announce it:
   * the window is 15 minutes on testnet against a two-hour sweep.
   */
  assert.equal(releaseAvailable({ ...base, now: base.submittedAt + WINDOW - 1 }), false, 'a second early');
  assert.equal(releaseAvailable({ ...base, now: base.submittedAt + WINDOW }), true, 'exactly at the boundary');
  assert.equal(releaseAvailable({ ...base, now: base.submittedAt + WINDOW + 60 }), true);
});

test('it never fires where the escrow would refuse the release', () => {
  // Past expiry the escrow cannot pay the agent at all — the buyer reclaims.
  assert.equal(releaseAvailable({ ...base, now: base.expiredAt + 1 }), false, 'expired');
  // A dispute is its own path, with its own actors and deadlines.
  assert.equal(releaseAvailable({ ...base, now: base.submittedAt + WINDOW + 60, disputed: true }), false);
  // Nothing delivered yet, so nothing to release.
  assert.equal(releaseAvailable({ ...base, status: 'FUNDED', now: base.submittedAt + WINDOW + 60 }), false);
  assert.equal(releaseAvailable({ ...base, status: 'COMPLETED', now: base.submittedAt + WINDOW + 60 }), false, 'already paid');
  assert.equal(releaseAvailable({ ...base, submittedAt: 0, now: 9_999_999 }), false, 'never submitted');
});

test('the seven-day mainnet window is the same rule, not a special case', () => {
  const mainnet = { ...base, disputeWindowSeconds: 604_800, expiredAt: base.submittedAt + 604_800 + 86_400 };
  assert.equal(releaseAvailable({ ...mainnet, now: base.submittedAt + 604_799 }), false);
  assert.equal(releaseAvailable({ ...mainnet, now: base.submittedAt + 604_800 }), true);
});
