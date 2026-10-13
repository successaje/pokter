import { test } from 'node:test';
import assert from 'node:assert/strict';

import { walletActionError } from '../src/lib/wallet/errors';
import { formatElapsed } from '../src/lib/ui/format';

/*
 * What a person is told when a transaction fails. This is the money path: the
 * difference between "Commissioning was cancelled, no transaction was
 * submitted" and "ERC8183Error" is the difference between a user who retries
 * and a user who does not know whether their funds moved.
 */

test('a cancelled signature says nothing was submitted', () => {
  const message = walletActionError(
    new Error('User rejected the request.'),
    'Commissioning',
  );
  assert.match(message, /cancelled/i);
  assert.match(message, /no transaction was submitted/i);
});

test('a bare error name never reaches the user', () => {
  for (const raw of ['ERC8183Error', 'ERC8183Error.', 'TypeError', '0xa9059cbb']) {
    const message = walletActionError(new Error(raw), 'Commissioning');
    assert.doesNotMatch(message, /ERC8183Error|TypeError|0xa9059cbb/);
    assert.match(message, /did not complete/i);
  }
});

test('the untranslatable fallback claims nothing about what moved', () => {
  /*
   * It cannot see how far the caller got, and "nothing was transferred" is
   * false for a failure that follows a completed swap.
   */
  const message = walletActionError(new Error('WeirdSdkFailure'), 'Commissioning');
  assert.doesNotMatch(message, /nothing was transferred/i);
});

test('real prose is left alone for the branches that handle it', () => {
  const insufficient = walletActionError(
    new Error('insufficient funds for gas * price + value'),
    'Commissioning',
  );
  assert.match(insufficient, /more funds/i);

  const chain = walletActionError(new Error('chain mismatch'), 'Commissioning');
  assert.match(chain, /network/i);
});

test('a domain message written by us survives unedited', () => {
  const raw =
    'No PancakeSwap route to $U is available right now. Fund the wallet with at least 0.1 $U directly.';
  assert.equal(walletActionError(new Error(raw), 'Commissioning'), raw);
});

test('an enormous message is truncated rather than dumped', () => {
  const message = walletActionError(
    new Error(`a b ${'x'.repeat(2000)}`),
    'Commissioning',
  );
  assert.ok(message.length <= 500, `was ${message.length}`);
});

test('elapsed spans read correctly at every boundary', () => {
  const m = 60_000;
  assert.equal(formatElapsed(0), 'less than a minute');
  assert.equal(formatElapsed(m), '1 minute');
  assert.equal(formatElapsed(2 * m), '2 minutes');
  assert.equal(formatElapsed(59 * m), '59 minutes');
  assert.equal(formatElapsed(60 * m), '1 hour');
  assert.equal(formatElapsed(90 * m), '1h 30m');
  assert.equal(formatElapsed(23 * 60 * m), '23 hours');
  assert.equal(formatElapsed(24 * 60 * m), '1 day');
  assert.equal(formatElapsed(48 * 60 * m), '2 days');
});

test('a negative span never reads as a negative duration', () => {
  assert.equal(formatElapsed(-5000), 'less than a minute');
});

/*
 * A viem RPC error must carry the call it failed on.
 *
 * A mainnet hire failed with "Invalid parameters were provided to the
 * RPC method" and nothing else, which named no request and left the
 * report unusable. viem puts the method and arguments in `details` and
 * `metaMessages`; only `shortMessage` was being shown.
 */
test('an invalid-params error names the method that was rejected', () => {
  const error = Object.assign(new Error('long viem message'), {
    shortMessage: 'Invalid parameters were provided to the RPC method. Double check you have provided the correct parameters.',
    details: 'Invalid params',
    metaMessages: ['Request Arguments:', '  method:  wallet_sendCalls', '  chain:   BNB Smart Chain (id: 56)'],
  });
  const text = walletActionError(error, 'Commissioning');
  assert.match(text, /wallet_sendCalls/);
  assert.match(text, /id: 56/);
  assert.ok(text.length <= 500);
});

test('a plain error is unchanged by the detail pass', () => {
  const text = walletActionError(
    Object.assign(new Error('x'), { shortMessage: 'The agent has not signed a price for this budget.' }),
    'Commissioning',
  );
  assert.equal(text, 'The agent has not signed a price for this budget.');
});

test('a declined signature still reads as a choice, not a fault', () => {
  const text = walletActionError(
    Object.assign(new Error('x'), { shortMessage: 'User rejected the request.', details: 'method: eth_sendTransaction' }),
    'Commissioning',
  );
  assert.match(text, /cancelled/i);
  assert.ok(!/eth_sendTransaction/.test(text), 'no plumbing in a message about a choice');
});

test('a transaction the network never received is not reported as slow', () => {
  /*
   * A wallet handed back 0x9ebbabe3… for a hand-delivery, the receipt
   * wait timed out, and the chain had no record of it — not mined, not
   * pending, the nonce untouched. "Timed out while waiting to be
   * confirmed" sends the reader to wait for something that will never
   * arrive; the two cases call for opposite responses.
   */
  const text = walletActionError(new Error('SUBMIT_NOT_BROADCAST'), 'Delivering');
  assert.match(text, /never broadcast/);
  assert.match(text, /no fee was paid/);
  assert.match(text, /Try again/);
  assert.ok(!/timed out|wait/i.test(text), text);
});
