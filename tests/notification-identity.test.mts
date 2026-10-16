import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canSubscribeSilently, identityKey, identityState, identityUsable,
  confirmedAddress, maskEmail, notificationIdentityMessage, subscriptionAddress,
  type IdentityPurpose, type NotificationIdentity,
} from '../src/lib/notifications/identity';

const row = (over: Partial<NotificationIdentity> = {}): NotificationIdentity => ({
  wallet: '0xAbc0000000000000000000000000000000000001',
  chainId: 56,
  email: 'buyer@example.com',
  provenAt: '2026-10-16T12:00:00Z',
  verifiedAt: '2026-10-16T12:05:00Z',
  removedAt: null,
  ...over,
});

test('both halves are required before anything is called enabled', () => {
  /*
   * A wallet signature says where updates may go; the emailed link says the
   * inbox is real. Showing "Enabled" after one of them is how somebody ends
   * up believing they will be told about a delivery that they will not.
   */
  assert.equal(identityState(row()), 'ready');
  assert.equal(identityState(row({ provenAt: null })), 'pending-signature');
  assert.equal(identityState(row({ verifiedAt: null })), 'pending-email');
  assert.equal(identityState(null), 'none');
  assert.equal(identityState(row({ removedAt: '2026-10-16T13:00:00Z' })), 'none');

  assert.equal(identityUsable(row()), true);
  assert.equal(identityUsable(row({ verifiedAt: null })), false);
});

test('a proven identity is still not consent to subscribe to every job', () => {
  /*
   * The identity supplies the address so nobody retypes it. It does not say
   * the buyer wants updates for work they have not funded yet — each job is
   * opted into on its own.
   */
  assert.equal(canSubscribeSilently(row()), true, 'the address may be reused');
  assert.equal(canSubscribeSilently(row({ verifiedAt: null })), false);
  assert.equal(canSubscribeSilently(null), false);
});

test('a change in flight is its own state, not just "unconfirmed"', () => {
  /*
   * The jobs already running keep sending to the address on file until the
   * new one confirms, so calling this merely pending would understate what
   * is still arriving in the buyer's inbox.
   */
  const changing = row({ email: 'new@example.com', verifiedAt: null, previousEmail: 'buyer@example.com' });
  assert.equal(identityState(changing), 'replacing');
  assert.equal(identityUsable(changing), false, 'the new address cannot be reused until it confirms');

  // A first address, with nothing to replace, is simply pending.
  assert.equal(identityState(row({ verifiedAt: null, previousEmail: null })), 'pending-email');
});

test('a proof is scoped to one chain, so testnet cannot speak for mainnet', () => {
  /*
   * The same address on 56 and 97 is one key for an EOA but two contracts
   * for a smart account, which need not share an owner.
   */
  const wallet = '0xAbc0000000000000000000000000000000000001';
  assert.notEqual(identityKey(wallet, { chainId: 56 }), identityKey(wallet, { chainId: 97 }));
  assert.equal(identityKey(wallet.toUpperCase(), { chainId: 56 }), identityKey(wallet.toLowerCase(), { chainId: 56 }));
});

const message = (purpose: IdentityPurpose) => notificationIdentityMessage({
  challengeId: 'c1', nonce: 'n1', chainId: 56,
  wallet: '0xAbc0000000000000000000000000000000000001',
  purpose,
  issuedAt: '2026-10-16T12:00:00Z', expiresAt: '2026-10-16T12:10:00Z',
});

test('the signed message names what it permits, and what it does not', () => {
  const text = message({ kind: 'claim', email: 'buyer@example.com' });
  for (const line of ['Wallet: 0xAbc', 'Email: buyer@example.com', 'Nonce: n1', 'Expires at: 2026-10-16T12:10:00Z']) {
    assert.ok(text.includes(line), line);
  }
  assert.match(text, /does not authorize transactions/);
  assert.match(text, /each job is opted into separately/);
});

test('a signature to stop updates does not read as one to start them', () => {
  /*
   * A wallet that signed "send my updates here" has not agreed to "stop
   * sending them". Both acts need the same key, so this is not an
   * escalation — but one challenge redeeming for either would have the
   * buyer signing words describing the opposite of what happens.
   */
  const claim = message({ kind: 'claim', email: 'buyer@example.com' });
  const stopAll = message({ kind: 'stop-email' });
  const stopJob = message({ kind: 'stop-job', jobId: '1502' });

  assert.match(claim, /Purpose: Allow Pokter to send/);
  assert.match(stopAll, /Purpose: Remove the email address/);
  assert.match(stopJob, /Purpose: Stop email updates for job #1502/);
  assert.ok(stopJob.includes('Job: #1502'), 'the job being silenced is named');

  for (const text of [claim, stopAll, stopJob]) {
    assert.match(text, /does not authorize transactions/);
  }
  assert.notEqual(claim, stopAll);
  assert.notEqual(stopAll, stopJob);
});

test('stopping one job says the job page still shows the deadline', () => {
  // So nobody reads "stop updates" as "stop the review window".
  assert.match(message({ kind: 'stop-job', jobId: '7' }), /keeps showing the delivery and the review deadline/);
});

test('a displayed address never carries the whole inbox', () => {
  assert.equal(maskEmail('buyer@example.com'), 'b•••r@example.com');
  assert.equal(maskEmail('ab@example.com'), 'a•@example.com');
  assert.equal(maskEmail('not-an-email'), '•••');
});

test('during a change, mail is still going to the old address', () => {
  /*
   * Anything that reads, stops or lists live subscriptions has to use this.
   * Reading the new address instead would find no rows and tell the buyer
   * nothing is sending, while their old inbox keeps filling up.
   */
  const changing = row({ email: 'new@example.com', verifiedAt: null, previousEmail: 'buyer@example.com' });
  assert.equal(subscriptionAddress(changing), 'buyer@example.com');
  assert.equal(subscriptionAddress(row()), 'buyer@example.com', 'with nothing in flight it is simply the address');
  assert.equal(subscriptionAddress(row({ removedAt: '2026-10-16T13:00:00Z' })), null, 'a removed address sends nothing');
  assert.equal(subscriptionAddress(null), null);
});

test('an unconfirmed address is still queried, but never called the one in use', () => {
  /*
   * Two different questions. A buyer may have typed this address into a job
   * page long before any wallet signed for it, so its rows are live and
   * have to be found — but a first-time claim has confirmed nothing, and
   * reporting it as the address in use had Settings tell somebody "updates
   * keep going to" an inbox that had never agreed to receive any.
   */
  const fresh = row({ verifiedAt: null, previousEmail: null });
  assert.equal(subscriptionAddress(fresh), 'buyer@example.com', 'its typed rows are still live');
  assert.equal(confirmedAddress(fresh), null, 'but nothing is confirmed to go there');

  assert.equal(confirmedAddress(row()), 'buyer@example.com');
  const changing = row({ email: 'new@example.com', verifiedAt: null, previousEmail: 'buyer@example.com' });
  assert.equal(confirmedAddress(changing), 'buyer@example.com', 'mid-change it is the old, confirmed one');
  assert.equal(confirmedAddress(row({ removedAt: '2026-10-16T13:00:00Z' })), null);
  assert.equal(confirmedAddress(null), null);
});
