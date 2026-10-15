import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_REFUSAL, statedRefusal } from '../src/lib/erc8183/refusal';

/**
 * A seller's refusal is third-party text shown to a buyer, and it is the
 * most useful sentence the seller produces: "needs the token address" is
 * a brief a buyer fixes in seconds, where "may be unreachable" loses the
 * hire. These pin both halves — that it survives, and that it is handled
 * as data rather than trusted.
 */

test('a seller that says why is quoted', () => {
  assert.equal(
    statedRefusal('lp_tier_plan needs `token`: the token or pool address (0x…).'),
    'lp_tier_plan needs `token`: the token or pool address (0x…).',
  );
});

test('a refusal that is not text is no refusal', () => {
  for (const value of [undefined, null, 42, {}, [], true]) {
    assert.equal(statedRefusal(value), null);
  }
  assert.equal(statedRefusal('   '), null, 'whitespace is not a reason');
});

test('control characters never reach the notice', () => {
  // Newlines and escapes in somebody else's string have no business in a
  // one-line message, and an escape sequence in a terminal is worse.
  assert.equal(statedRefusal('needs\na token\u0000address\u001b[31m'), 'needs a token address [31m');
  assert.equal(statedRefusal('spaced     out\t\tbadly'), 'spaced out badly');
});

test('an essay is cut to a reason', () => {
  const long = statedRefusal('x'.repeat(MAX_REFUSAL + 200));
  assert.equal(long?.length, MAX_REFUSAL);
  assert.ok(long?.endsWith('…'), 'the cut is visible rather than silent');
});

test('a refusal exactly at the limit is left alone', () => {
  const exact = 'y'.repeat(MAX_REFUSAL);
  assert.equal(statedRefusal(exact), exact);
});
