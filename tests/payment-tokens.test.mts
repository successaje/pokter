import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  UnknownPaymentTokenError, VERIFIED_AT, decimalsFor, formatAmount, knownTokens,
  offeredTokens, paymentTokenAt, requireDecimals, uniformOfferedDecimals,
} from '../src/lib/network/tokens';
import { escrowChainForCurrency, enabledEscrowChains } from '../src/lib/network/escrow';

const U_56 = '0xcE24439F2D9C6a2289F741120FE202248B666666';
const U_97 = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
const USDT_56 = '0x55d398326f99059fF775485246999027B3197955';
const USDT_97 = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
const USDC_56 = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';
const USDC_97 = '0xEC1C60D64a06896Df296438c12edD14E974FDE47';
const DEAD = '0x000000000000000000000000000000000000dEaD';

test('$U stays the only offered token', () => {
  // The whole point of this change: groundwork, no new money on offer.
  for (const chainId of [56, 97]) {
    const offered = offeredTokens(chainId);
    assert.equal(offered.length, 1, `chain ${chainId} offers exactly one token`);
    assert.equal(offered[0].symbol, 'U');
  }
  for (const chainId of [56, 97]) {
    assert.equal(knownTokens(chainId).filter((t) => t.symbol === 'USDT')[0].offered, false);
  }
});

test('a token is identified by chain and address, never by symbol', () => {
  /*
   * USDT exists on both chains at different addresses, so a symbol does not
   * identify a token and cannot select a chain. Reading the right scale
   * depends on using the pair.
   */
  assert.notEqual(USDT_56.toLowerCase(), USDT_97.toLowerCase());
  assert.equal(paymentTokenAt(56, USDT_56)?.chainId, 56);
  assert.equal(paymentTokenAt(97, USDT_56), null, 'mainnet USDT is not a testnet token');
  assert.equal(paymentTokenAt(56, USDT_97), null, 'and the reverse');
});

test('the same symbol has different decimals on the two chains', () => {
  /*
   * The case a hardcoded 18 gets wrong, and it is not hypothetical: these are
   * the live USDC deployments on the two chains Pokter settles on, read at
   * the blocks recorded in VERIFIED_AT.
   */
  assert.equal(decimalsFor(56, USDC_56), 18);
  assert.equal(decimalsFor(97, USDC_97), 6);
  assert.equal(VERIFIED_AT[56], 128973013);
  assert.equal(VERIFIED_AT[97], 138113102);

  // One unit of each, so the scale is the only thing under test.
  assert.equal(formatAmount(56, USDC_56, 10n ** 18n)?.label, '1 USDC');
  assert.equal(formatAmount(97, USDC_97, 10n ** 6n)?.label, '1 USDC');
  // And the failure a literal 18 would have produced, stated as a number.
  assert.equal(formatAmount(97, USDC_97, 10n ** 18n)?.amount, '1000000000000');
});

test('an unverified token has no decimals and no label', () => {
  // Unknown metadata must stay unknown: there is no safe default scale.
  assert.equal(decimalsFor(56, DEAD), null);
  assert.equal(formatAmount(56, DEAD, 10n ** 18n), null);
  assert.throws(() => requireDecimals(56, DEAD), UnknownPaymentTokenError);
  assert.throws(() => requireDecimals(56, DEAD), /refusing to assume/);

  // Malformed input is not a token either, and must not throw on the way out.
  assert.equal(paymentTokenAt(56, 'not-an-address'), null);
  assert.equal(formatAmount(56, 'not-an-address', 1n), null);
  assert.equal(formatAmount(56, null, 1n), null, 'no currency means no claim');
  assert.equal(formatAmount(56, U_56, 'not-a-number'), null, 'nor does an unparseable amount');
});

test('a token the escrow does not support is recorded as such', () => {
  // Testnet USDC: read from the chain, isPaymentTokenSupported returned false.
  assert.equal(paymentTokenAt(97, USDC_97)?.escrowSupported, false);
  assert.equal(paymentTokenAt(56, USDC_56)?.escrowSupported, true);
  // Supported is not offered, and nothing should read one for the other.
  assert.equal(paymentTokenAt(56, USDT_56)?.escrowSupported, true);
  assert.equal(paymentTokenAt(56, USDT_56)?.offered, false);
});

test('$U keeps its dollar sign and other tokens do not gain one', () => {
  assert.equal(formatAmount(56, U_56, 10n ** 18n)?.label, '1 $U');
  assert.equal(formatAmount(97, U_97, 10n ** 18n)?.label, '1 $U');
  assert.equal(formatAmount(56, USDT_56, 10n ** 18n)?.label, '1 USDT');
});

test('chain, currency and escrow cannot disagree', () => {
  /*
   * The inference that picks an escrow from a currency matches on address,
   * so each token resolves to the one chain it is deployed on. A quote in
   * mainnet $U can only ever be funded on 56.
   */
  const enabled = enabledEscrowChains('97,56');
  assert.equal(escrowChainForCurrency(U_56, enabled), 56);
  assert.equal(escrowChainForCurrency(U_97, enabled), 97);
  assert.equal(escrowChainForCurrency(DEAD, enabled), null);

  // And the token the registry resolves for that chain is the same token the
  // quote named — so the scale used to approve is the scale of the money.
  for (const currency of [U_56, U_97]) {
    const chain = escrowChainForCurrency(currency, enabled)!;
    const token = paymentTokenAt(chain, currency)!;
    assert.equal(token.chainId, chain);
    assert.equal(requireDecimals(chain, currency), token.decimals);
  }
});

test('amounts never pass through a float', () => {
  /*
   * 0.1 + 0.2 in floating point is 0.30000000000000004. An amount formatted
   * from integers has no such artefact, at any scale.
   */
  assert.equal(formatAmount(56, U_56, 1n)?.amount, '0.000000000000000001');
  assert.equal(formatAmount(56, U_56, 3n * 10n ** 17n)?.amount, '0.3');
  assert.equal(formatAmount(97, USDC_97, 1n)?.amount, '0.000001');
  assert.equal(formatAmount(56, U_56, 10n ** 36n)?.amount, '1000000000000000000');
});

test('summing across jobs is blocked when scales diverge', () => {
  // Valid today because both offered tokens are 18dp; the guard is there so
  // that it stops being silent rather than staying true.
  assert.equal(uniformOfferedDecimals(), 18);
  const offered = [...new Set([56, 97].flatMap((c) => offeredTokens(c).map((t) => t.decimals)))];
  assert.deepEqual(offered, [18], 'if this ever grows a second entry the sum must fail');
});
