import assert from 'node:assert/strict';
import test from 'node:test';

import { describeQuoteFailure, quoteFailure, RECENT_QUOTE_MS, withRecentQuote } from '../src/lib/hire/failure';

const now = Date.parse('2026-10-21T17:00:00Z');
const forbidden = quoteFailure('auth-required', { detail: 'HTTP 403' });

test('a 403 from an agent that signed a price within the day reads as temporary and can be retried', () => {
  const f = withRecentQuote(forbidden, new Date(now - 40 * 60_000).toISOString(), now);
  assert.equal(f.retryable, true);
  const { message, status } = describeQuoteFailure(f, 'Mandate Guard-1');
  assert.equal(status, 503);
  assert.match(message, /refused this request \(HTTP 403\), though it signed a price for Pokter \d+ minutes ago/);
  assert.doesNotMatch(message, /cannot be hired/);
});

test('with no recent signed price, a 403 still says the endpoint needs credentials', () => {
  for (const last of [null, new Date(now - RECENT_QUOTE_MS - 1).toISOString()]) {
    const f = withRecentQuote(forbidden, last, now);
    assert.equal(f.retryable, false);
    assert.match(describeQuoteFailure(f, 'An agent').message, /requires credentials Pokter does not hold \(HTTP 403\)\. It cannot be hired through Pokter\./);
  }
});

test('other failures are left alone', () => {
  const declined = quoteFailure('seller-declined');
  assert.equal(withRecentQuote(declined, new Date(now).toISOString(), now), declined);
});
