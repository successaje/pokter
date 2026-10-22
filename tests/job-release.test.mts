import assert from 'node:assert/strict';
import test from 'node:test';

import { releaseAllowed } from '../src/lib/jobs/release';

test('while the review window is open, nothing is released, verified or not', () => {
  assert.equal(releaseAllowed({ reviewOpen: true, receiptVerified: true, disputed: false }).allowed, false);
  assert.equal(releaseAllowed({ reviewOpen: true, receiptVerified: false, disputed: false }).allowed, false);
});

test('before the window is known, the receipt must be verified', () => {
  assert.equal(releaseAllowed({ reviewOpen: null, receiptVerified: false, disputed: false }).allowed, false);
  assert.match(releaseAllowed({ reviewOpen: null, receiptVerified: false, disputed: false }).reason ?? '', /Verify the receipt/);
  assert.equal(releaseAllowed({ reviewOpen: null, receiptVerified: true, disputed: false }).allowed, true);
});

test('once the window has closed with no dispute, an unreadable receipt no longer blocks payment (job 56:57001)', () => {
  assert.equal(releaseAllowed({ reviewOpen: false, receiptVerified: false, disputed: false }).allowed, true);
  assert.equal(releaseAllowed({ reviewOpen: false, receiptVerified: true, disputed: false }).allowed, true);
});

test('a disputed job is settled by the vote, not by this check', () => {
  assert.equal(releaseAllowed({ reviewOpen: true, receiptVerified: false, disputed: true }).allowed, true);
});
