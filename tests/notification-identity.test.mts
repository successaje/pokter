import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canSubscribeSilently, identityKey, identityState, identityUsable,
  maskEmail, notificationIdentityMessage, type NotificationIdentity,
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

test('the old address stays live while a replacement is unverified', () => {
  // Otherwise changing an email would silently stop updates mid-job.
  const current = row();
  const incoming = row({ email: 'new@example.com', verifiedAt: null });
  assert.equal(identityState(current, incoming), 'replacing');
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

test('the signed message names what it permits, and what it does not', () => {
  const message = notificationIdentityMessage({
    challengeId: 'c1', nonce: 'n1', chainId: 56,
    wallet: '0xAbc0000000000000000000000000000000000001',
    email: 'buyer@example.com',
    issuedAt: '2026-10-16T12:00:00Z', expiresAt: '2026-10-16T12:10:00Z',
  });
  for (const line of ['Wallet: 0xAbc', 'Email: buyer@example.com', 'Nonce: n1', 'Expires at: 2026-10-16T12:10:00Z']) {
    assert.ok(message.includes(line), line);
  }
  assert.match(message, /does not authorize transactions/);
  assert.match(message, /each job is opted into separately/);
});

test('a displayed address never carries the whole inbox', () => {
  assert.equal(maskEmail('buyer@example.com'), 'b•••r@example.com');
  assert.equal(maskEmail('ab@example.com'), 'a•@example.com');
  assert.equal(maskEmail('not-an-email'), '•••');
});
