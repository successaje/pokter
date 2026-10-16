import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addressChangePlan, describeAddressChange, sendPermitted,
  UNSOLICITED_PERMITTED, type StoredConsent,
} from '../src/lib/notifications/preferences';

const consents: StoredConsent[] = [
  { mailClass: 'job', subject: '97:1502' },
  { mailClass: 'agent-watch', subject: '56:41' },
];

test('a consent covers the one thing it was given for', () => {
  assert.equal(sendPermitted(consents, { mailClass: 'job', subject: '97:1502' }), true);
  assert.equal(sendPermitted(consents, { mailClass: 'job', subject: '97:1503' }), false, 'another job was never asked about');
  assert.equal(sendPermitted(consents, { mailClass: 'agent-watch', subject: '56:99' }), false, 'another agent was never asked about');
});

test('following a job is not agreeing to hear about agents, or the reverse', () => {
  /*
   * A marketplace with one proven address per wallet is one query away from
   * a mailing list. The only thing between the two is that no stored row
   * reads as agreement to anything but its own subject.
   */
  assert.equal(sendPermitted(consents, { mailClass: 'agent-watch', subject: '97:1502' }), false);
  assert.equal(sendPermitted(consents, { mailClass: 'builder', subject: '97:1502' }), false);
});

test('nothing is sendable without a consent naming it', () => {
  assert.deepEqual([...UNSOLICITED_PERMITTED], [], 'Pokter sends no unsolicited mail today');
  assert.equal(sendPermitted([], { mailClass: 'job', subject: '97:1502' }), false);
});

const running = [{ chainId: 97, jobId: '1502' }, { chainId: 56, jobId: '880' }];

test('changing an address asks what happens to work already running', () => {
  /*
   * Both answers are reasonable and guessing wrong costs either way:
   * silently moving mail about a live escrow is a disclosure nobody asked
   * for, and silently dropping it loses the delivery notice on work already
   * paid for.
   */
  assert.deepEqual(addressChangePlan({ running, choice: 'move' }), { move: running, stop: [] });
  assert.deepEqual(addressChangePlan({ running, choice: 'stop' }), { move: [], stop: running });
});

test('re-confirming the same address never stops anything', () => {
  // Nothing is changing, so neither answer should be able to interrupt it.
  for (const choice of ['move', 'stop'] as const) {
    assert.deepEqual(addressChangePlan({ running, choice, sameAddress: true }), { move: running, stop: [] });
  }
});

test('the choice is described before it is made, and counts the jobs', () => {
  assert.match(describeAddressChange('move', 2), /2 jobs will keep sending updates, to the new address/);
  assert.match(describeAddressChange('stop', 1), /1 job will stop sending updates/);
  assert.match(describeAddressChange('stop', 1), /job pages still show every delivery and deadline/);
  assert.match(describeAddressChange('move', 0), /nothing to carry over/);
});
