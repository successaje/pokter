import assert from 'node:assert/strict';
import test from 'node:test';

import { escrowChainForHire, escrowOptionsForHire, paidHireChain } from '../src/lib/network/escrow';

const U56 = '0xcE24439F2D9C6a2289F741120FE202248B666666';
const U97 = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
const BOTH = [56, 97] as const;

test('a verified mainnet price settles on mainnet', () => {
  assert.equal(paidHireChain({ quoteCurrency: U56, payable: true }, [...BOTH]), 56);
});

test('a verified testnet price settles on testnet', () => {
  assert.equal(paidHireChain({ quoteCurrency: U97, payable: true }, [...BOTH]), 97);
});

test('no price means no hiring network, not a testnet one', () => {
  /*
   * The whole point. The old rule fell back to 97 for anything unpriced,
   * which printed "Test tokens · BNB Testnet" on 58 of 77
   * mainnet-registered agents — none of which had priced in testnet
   * currency. A missing price does not establish that an agent is
   * testnet-only.
   */
  assert.equal(paidHireChain({ quoteCurrency: null, payable: null }, [...BOTH]), null);
  assert.equal(paidHireChain({ quoteCurrency: undefined, payable: undefined }, [...BOTH]), null);
});

test('an unverifiable price means no hiring network either', () => {
  /*
   * An agent whose quote Pokter rejected has, as far as the escrow is
   * concerned, no price — and saying "testnet" about it would assert a
   * settlement nobody can make.
   */
  assert.equal(paidHireChain({ quoteCurrency: U56, payable: false }, [...BOTH]), null);
  assert.equal(paidHireChain({ quoteCurrency: U56, payable: null }, [...BOTH]), null);
});

test('a price in a token no enabled escrow settles is still null', () => {
  assert.equal(paidHireChain({ quoteCurrency: '0xdeadbeef00000000000000000000000000000000', payable: true }, [...BOTH]), null);
});

test('the hire-options rule is untouched: the free trial is still offered', () => {
  /*
   * `paidHireChain` answers "which money pays this price". It must not
   * change which escrows a buyer may hire on — testnet stays available for
   * an unpriced agent, which is where the free trial happens.
   */
  assert.equal(escrowChainForHire(null, [...BOTH]), 97, 'unchanged');
  assert.deepEqual(escrowOptionsForHire(null, [...BOTH]), [97]);
  assert.deepEqual(escrowOptionsForHire(U56, [...BOTH]), [56, 97]);
});

test('with only mainnet enabled, an unpriced agent has no fallback at all', () => {
  // And so no hiring network and no trial: both correctly absent.
  assert.equal(paidHireChain({ quoteCurrency: null, payable: null }, [56]), null);
  assert.equal(escrowChainForHire(null, [56]), null);
});
