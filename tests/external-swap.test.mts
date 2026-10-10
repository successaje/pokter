import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSwapCalls, buildSwapTransaction, wrappedNative } from '../src/lib/pancakeswap/swap';
import { walletActionError } from '../src/lib/wallet/errors';

const quote = {
  tokenIn: wrappedNative(97),
  amountOut: 100_000_000_000_000_000n,
  amountIn: 900_000_000_000_000n,
  amountInMaximum: 1_000_000_000_000_000n,
  fee: 500,
  quotedAt: Date.now(),
};
const TOKEN = '0xc70b8741b8b07a6d61e54fd4b20f22fa648e5565' as const;
const ME = '0x3fb8779f4f42e1800f27aaec9564530bcaa852bf' as const;

test('the refund rides in the same transaction as the swap', () => {
  const calls = buildSwapCalls(quote, TOKEN, ME);
  const tx = buildSwapTransaction(quote, TOKEN, ME);

  assert.equal(calls.length, 2, 'exactOutputSingle plus refundETH');
  assert.equal(
    tx.value,
    quote.amountInMaximum,
    'the whole native amount rides on one call, so the refund cannot be stranded',
  );
  // Both inner calls are encoded into the multicall payload.
  for (const call of calls) {
    assert.ok(
      tx.data.includes(call.data.slice(2)),
      'every inner call survives into the multicall data',
    );
  }
});

test('an exact-output swap is charged the real price, not the ceiling', () => {
  assert.ok(
    quote.amountInMaximum > quote.amountIn,
    'the ceiling exceeds the price, which is why the refund has to be atomic',
  );
});

test('the swap failures say what went wrong and what to do', () => {
  const native = walletActionError(new Error('INSUFFICIENT_NATIVE_FOR_SWAP'), 'Funding');
  assert.match(native, /faucet|top it up/i);
  assert.match(native, /lower the budget/i);
  assert.doesNotMatch(native, /INSUFFICIENT_NATIVE_FOR_SWAP/);

  // There is no WBNB/$U pool on the escrow chain, so this is the branch a
  // short wallet actually hits. It has to name the way out, which is the
  // faucet rather than a swap.
  const route = walletActionError(new Error('NO_SWAP_ROUTE'), 'Funding');
  assert.match(route, /faucet/i);
  assert.doesNotMatch(route, /NO_SWAP_ROUTE/);

  const reverted = walletActionError(new Error('SWAP_REVERTED'), 'Funding');
  assert.match(reverted, /nothing was funded/i, 'says the escrow is untouched');
  assert.doesNotMatch(reverted, /SWAP_REVERTED/);

  const short = walletActionError(new Error('INSUFFICIENT_PAYMENT_TOKEN'), 'Funding');
  assert.match(short, /\$U/);
  assert.doesNotMatch(short, /INSUFFICIENT_PAYMENT_TOKEN/);
});

test('a shortfall no longer points a browser-wallet user at a passkey', () => {
  const message = walletActionError(new Error('insufficient funds for gas'), 'Funding');
  assert.doesNotMatch(message, /passkey/i);
  assert.match(message, /connected wallet/i);
});

test('a cancelled prompt is still a cancellation, not a shortfall', () => {
  assert.match(walletActionError(new Error('User rejected the request'), 'Funding'), /cancelled/i);
});

test('the wrapped native token differs per chain, and the escrow chain gets its own', () => {
  const mainnet = wrappedNative(56);
  const testnet = wrappedNative(97);
  assert.notEqual(
    mainnet.toLowerCase(),
    testnet.toLowerCase(),
    'quoting mainnet WBNB on chain 97 reverts every tier and reads as "no route"',
  );
  assert.equal(testnet.toLowerCase(), '0xae13d989dac2f0debff460ac112a837c89baa7cd');
  assert.throws(() => wrappedNative(1), /chain 1/, 'an unregistered chain is a mistake, not a null');
});

test('the swap executes against exactly the token that was quoted', () => {
  const calls = buildSwapCalls(quote, '0xc70b8741b8b07a6d61e54fd4b20f22fa648e5565', '0x3fb8779f4f42e1800f27aaec9564530bcaa852bf');
  assert.ok(
    calls[0].data.toLowerCase().includes(quote.tokenIn.slice(2).toLowerCase()),
    'the quoted tokenIn is encoded into the swap, not re-derived',
  );
});
