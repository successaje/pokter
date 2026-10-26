import assert from 'node:assert/strict';
import test from 'node:test';

import { formatQuotedPrice, tokenLabel } from '../src/lib/erc8183/pricing';
test('a quoted price names the token it is actually in', () => {
  /*
   * Every price rendered as "$U" regardless of its token, so an agent
   * quoting 1 USDT was shown as "1.00 $U" on its own page — the right
   * number against the wrong money, on the figure a buyer decides with.
   */
  const U_56 = '0xcE24439F2D9C6a2289F741120FE202248B666666';
  const U_97 = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
  const USDT = '0x55d398326f99059fF775485246999027B3197955';

  assert.equal(formatQuotedPrice(1, U_56), '1 $U');
  assert.equal(formatQuotedPrice(1, U_97), '1 $U', 'the testnet escrow token is also $U');
  assert.equal(formatQuotedPrice(1, USDT), '1 USDT');
  assert.equal(formatQuotedPrice(0.05, USDT), '0.05 USDT');
});

test('an unknown token is named by its address, never guessed', () => {
  const odd = '0x1234567890abcdef1234567890abcdef12345678';
  assert.equal(formatQuotedPrice(2, odd), '2 0x1234…5678');
  assert.equal(tokenLabel(odd), '0x1234…5678');
});

test('token naming ignores case, as addresses do', () => {
  assert.equal(tokenLabel('0x55D398326F99059FF775485246999027B3197955'), 'USDT');
});

test('a missing currency is unknown, never assumed to be $U, and free is free', () => {
  // A price with no recorded token could be in any token the escrow funds;
  // calling it $U would label a USDT price wrongly after a rollback.
  assert.equal(tokenLabel(null), '(currency unknown)');
  assert.equal(formatQuotedPrice(1, null), '1 (currency unknown)');
  assert.equal(formatQuotedPrice(0, '0x55d398326f99059fF775485246999027B3197955'), 'Free');
});

test('a signed price is shown exactly, never rounded to cents, and keeps its token', () => {
  assert.equal(formatQuotedPrice(0.000001, '0x55d398326f99059fF775485246999027B3197955'), '0.000001 USDT');
  assert.equal(formatQuotedPrice(0.1 + 0.2, '0x55d398326f99059fF775485246999027B3197955'), '0.3 USDT', 'float noise is not shown as precision');
});
