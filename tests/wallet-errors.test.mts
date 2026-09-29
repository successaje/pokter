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
