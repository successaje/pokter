import assert from 'node:assert/strict';
import test from 'node:test';

import {
  jobUpdateLabel, jobUpdateOffer, stopNeedsWalletProof, subscriptionPreVerified,
  type JobUpdateRow,
} from '../src/lib/notifications/job-updates';
import type { NotificationIdentity } from '../src/lib/notifications/identity';

const identity = (over: Partial<NotificationIdentity> = {}): NotificationIdentity => ({
  wallet: '0xabc0000000000000000000000000000000000001',
  chainId: 56,
  email: 'buyer@example.com',
  provenAt: '2026-10-16T12:00:00Z',
  verifiedAt: '2026-10-16T12:05:00Z',
  removedAt: null,
  ...over,
});

const row = (over: Partial<JobUpdateRow> = {}): JobUpdateRow => ({
  email: 'buyer@example.com',
  verifiedAt: '2026-10-16T12:10:00Z',
  unsubscribedAt: null,
  includeAnswer: false,
  ...over,
});

test('a proven address turns into one click, not another form', () => {
  // The whole point: four hires should not mean four identical email forms.
  assert.deepEqual(jobUpdateOffer({ identity: identity(), row: null }), {
    kind: 'reuse', email: 'buyer@example.com',
  });
  assert.equal(jobUpdateLabel({ kind: 'reuse', email: 'buyer@example.com' }), 'Get updates for this job');
});

test('with no proven address the original form is still the offer', () => {
  assert.deepEqual(jobUpdateOffer({ identity: null, row: null }), { kind: 'ask-email' });
});

test('a claimed but unconfirmed inbox is never offered as a working toggle', () => {
  /*
   * Nothing can be sent to it yet. Showing "Get updates" would leave the
   * buyer believing a delivery email is coming.
   */
  assert.deepEqual(jobUpdateOffer({ identity: identity({ verifiedAt: null }), row: null }), {
    kind: 'await-inbox', email: 'buyer@example.com',
  });
});

test('a live row decides the state, even with no identity behind it', () => {
  /*
   * Buyers who subscribed by typing an address have working updates whether
   * or not a wallet ever signed. Reporting "off" because no identity exists
   * would be false, and would invite a duplicate subscription.
   */
  const offer = jobUpdateOffer({ identity: null, row: row({ email: 'typed@example.com', includeAnswer: true }) });
  assert.deepEqual(offer, { kind: 'on', email: 'typed@example.com', includeAnswer: true });
});

test('an unconfirmed row is not "on"', () => {
  assert.equal(jobUpdateOffer({ identity: null, row: row({ verifiedAt: null }) }).kind, 'ask-email');
});

test('a stopped subscription is offered again rather than shown as on', () => {
  const offer = jobUpdateOffer({ identity: identity(), row: row({ unsubscribedAt: '2026-10-16T14:00:00Z' }) });
  assert.deepEqual(offer, { kind: 'resume', email: 'buyer@example.com' });
});

test('only the identity’s own address may skip the confirmation link', () => {
  /*
   * The link proves an inbox is real and willing. A ready identity has
   * already produced that proof for its own address; for any other address
   * it has produced nothing, and pre-verifying one would let anybody point
   * Pokter mail at an inbox that never agreed to it.
   */
  assert.equal(subscriptionPreVerified(identity(), 'buyer@example.com'), true);
  assert.equal(subscriptionPreVerified(identity(), 'BUYER@Example.com'), true, 'addresses compare case-insensitively');
  assert.equal(subscriptionPreVerified(identity(), 'someone-else@example.com'), false);
  assert.equal(subscriptionPreVerified(identity({ verifiedAt: null }), 'buyer@example.com'), false);
  assert.equal(subscriptionPreVerified(null, 'buyer@example.com'), false);
});

test('turning updates off costs a signature; turning them on does not', () => {
  /*
   * Asymmetric on purpose. On sends a wallet's own job to a wallet's own
   * proven inbox and discloses nothing new. Off can make a buyer miss the
   * review window and let a job settle unexamined, so knowing a public
   * wallet address must not be enough to do it.
   */
  assert.equal(stopNeedsWalletProof('app'), true);
  assert.equal(stopNeedsWalletProof('email-link'), false, 'the emailed link already proves the inbox');
});
