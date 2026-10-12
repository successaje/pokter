import assert from 'node:assert/strict';
import test from 'node:test';

import { wrappedNative } from '../src/lib/pancakeswap/swap';

/*
 * What a wallet holding only BNB is told when it cannot pay in $U.
 *
 * The plan itself reads balances and quotes a pool, so it is not pure.
 * What is pinned here is the fact the plan depends on and that differs
 * per chain — the wrapped native token — because a quote asked with the
 * wrong one silently returns "no route", which the interface then
 * reports as "there is no pool", which is a false statement about the
 * chain rather than about our query. That exact mistake was made once.
 */

test('each chain quotes against its own wrapped native token', () => {
  assert.equal(wrappedNative(56), '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c');
  assert.equal(wrappedNative(97), '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd');
  assert.notEqual(wrappedNative(56), wrappedNative(97));
});

test('an unregistered chain refuses rather than guessing mainnet', () => {
  assert.throws(() => wrappedNative(1));
});
