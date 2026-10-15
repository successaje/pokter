import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyQuoteError, describeQuoteFailure, explainFailure, isWalletRejection, quoteFailure } from '../src/lib/hire/failure';

test('a seller declining is a seller failure, not the buyer declining', () => {
  const declined = quoteFailure('seller-declined', { sellerReason: 'The brief names no wallet address' });
  assert.equal(declined.layer, 'seller');
  assert.equal(declined.retryable, false);
  const { message, status } = describeQuoteFailure(declined, 'Centreline');
  assert.equal(status, 422);
  assert.match(message, /Centreline declined this brief: “The brief names no wallet address”/);
  assert.equal(explainFailure(message, 'seller').title, 'The agent did not take this brief');
});

test('only the wallet layer says the buyer declined', () => {
  // Seller wording that used to match the wallet-decline pattern.
  for (const message of ['Sluicegate rejected the brief', 'Request denied by seller', 'The seller cancelled the quote']) {
    assert.notEqual(explainFailure(message, 'seller').title, 'You declined in the wallet');
    assert.notEqual(explainFailure(message).title, 'You declined in the wallet');
  }
  assert.equal(explainFailure('Commissioning was cancelled. No transaction was submitted.', 'wallet').title, 'You declined in the wallet');
});

test('wallet rejections are recognised by code and by the wallet’s own wording', () => {
  assert.equal(isWalletRejection({ code: 4001, message: 'whatever' }), true);
  assert.equal(isWalletRejection({ cause: { code: 4001 } }), true);
  assert.equal(isWalletRejection(Object.assign(new Error('User rejected the request.'), { name: 'UserRejectedRequestError' })), true);
  assert.equal(isWalletRejection(new DOMException('The operation is not allowed', 'NotAllowedError')), true);
  assert.equal(isWalletRejection(new Error('Centreline declined this brief: “rejected”')), false);
});

test('transport errors are classified by what they were, and say whether to retry', () => {
  assert.deepEqual(
    [401, 403, 429, 500].map((status) => classifyQuoteError(new Error(`Agent answered ${status}.`)).code),
    ['auth-required', 'auth-required', 'rate-limited', 'http-error'],
  );
  const timeout = classifyQuoteError(new DOMException('The operation timed out.', 'TimeoutError'));
  assert.equal(timeout.code, 'timeout');
  assert.equal(timeout.retryable, true);
  assert.equal(describeQuoteFailure(timeout, 'Gridloom').status, 504);
  assert.equal(classifyQuoteError(new Error('signature check failed: wrong signer')).code, 'bad-signature');
  assert.equal(classifyQuoteError(new TypeError('fetch failed')).code, 'unreachable');
});

test('protocol failures are not retryable and are not called network errors', () => {
  for (const code of ['bad-signature', 'terms-mismatch', 'no-quote'] as const) {
    const failure = quoteFailure(code);
    assert.equal(failure.layer, 'protocol');
    assert.equal(failure.retryable, false);
    assert.doesNotMatch(describeQuoteFailure(failure, 'X').message, /could not be reached/);
  }
  assert.equal(quoteFailure('no-price-skill').layer, 'seller');
  assert.equal(describeQuoteFailure(quoteFailure('seller-not-ready'), 'X').status, 409);
});
