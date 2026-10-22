import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyQuoteError, describeQuoteFailure } from '../src/lib/hire/failure';

/*
 * hwayongjin.agent (56:300282): its card answers 200 but names no A2A
 * interface (its platform reports UNBOUND, offline, endpoint null). A buyer
 * was told it "could not be reached" and to try again shortly.
 */
test('a card that answers but names no interface is not a network failure, and is not retryable', () => {
  const f = classifyQuoteError(new Error('The endpoint answered, but not with an agent card.'));
  assert.equal(f.code, 'no-endpoint');
  assert.equal(f.layer, 'seller');
  assert.equal(f.retryable, false);
  const { message, status } = describeQuoteFailure(f, 'hwayongjin.agent');
  assert.equal(status, 409);
  assert.match(message, /answers but names no service to send a brief to/);
  assert.doesNotMatch(message, /could not be reached|Try again/);
});

test('a genuine network failure is still unreachable and retryable', () => {
  const f = classifyQuoteError(new Error('fetch failed: ECONNREFUSED'));
  assert.equal(f.code, 'unreachable');
  assert.equal(f.retryable, true);
});
