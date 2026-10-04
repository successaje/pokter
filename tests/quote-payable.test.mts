import assert from 'node:assert/strict';
import test from 'node:test';

import { quotePayableWith } from '../src/lib/erc8183/payable';

/*
 * The payment tokens of the two ERC-8183 deployments, copied from the SDK's
 * address table rather than imported: the SDK's export map does not resolve
 * under the test runner, and these are the values worth pinning anyway.
 */
const MAINNET_U = '0xcE24439F2D9C6a2289F741120FE202248B666666';
const TESTNET_U = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
const REAL_USDT = '0x55d398326f99059fF775485246999027B3197955';
const ESCROW_TOKEN = TESTNET_U;
const MAINNET_TOKEN = MAINNET_U;

/*
 * Surveyed on 4 Oct 2026: of the thirteen agents in the catalogue that have
 * ever returned a signed price, ten quote in the mainnet token and one in
 * real BNB Chain USDT. The escrow settles on 97 and can pay none of them.
 */
test('a mainnet-token quote cannot be paid from the testnet escrow', () => {
  assert.equal(quotePayableWith(MAINNET_U, ESCROW_TOKEN), false);
});

test('real USDT is not the escrow token either', () => {
  assert.equal(quotePayableWith(REAL_USDT, ESCROW_TOKEN), false);
});

test('the escrow pays a quote in its own token', () => {
  assert.equal(quotePayableWith(TESTNET_U, ESCROW_TOKEN), true);
});

test('the same quote is payable on the chain it was priced for', () => {
  assert.equal(quotePayableWith(MAINNET_U, MAINNET_TOKEN), true);
  assert.equal(quotePayableWith(TESTNET_U, MAINNET_TOKEN), false);
});

test('checksum differences do not change the answer', () => {
  assert.equal(
    quotePayableWith(TESTNET_U.toLowerCase(), ESCROW_TOKEN),
    true,
  );
});

/* An unreadable currency is not a currency this escrow can pay. */
test('a currency that is not an address is refused rather than thrown', () => {
  for (const currency of ['', 'not-an-address', '0x1234']) {
    assert.equal(quotePayableWith(currency, ESCROW_TOKEN), false);
  }
});

test('an unreadable payment token is refused rather than thrown', () => {
  assert.equal(quotePayableWith(TESTNET_U, 'not-a-token'), false);
});
