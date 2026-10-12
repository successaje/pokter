import assert from 'node:assert/strict';
import test from 'node:test';

import {
  enabledEscrowChains,
  escrowChainForCurrency,
  escrowChainForHire,
  escrowOptionsForHire,
  ESCROW_PAYMENT_TOKEN,
  isEscrowChain,
  settlementHint,
} from '../src/lib/network/escrow';

const MAINNET_U = '0xce24439f2d9c6a2289f741120fe202248b666666';
const TESTNET_U = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
const USDT = '0x55d398326f99059fF775485246999027B3197955';

test('unset means testnet only, as before', () => {
  assert.deepEqual(enabledEscrowChains(undefined), [97]);
  assert.deepEqual(enabledEscrowChains(''), [97]);
  assert.deepEqual(enabledEscrowChains('nonsense, 1'), [97]);
});

test('mainnet opens only when listed', () => {
  assert.deepEqual(enabledEscrowChains('97,56'), [97, 56]);
  assert.deepEqual(enabledEscrowChains(' 56 '), [56]);
  assert.equal(isEscrowChain(56, [97]), false);
  assert.equal(isEscrowChain(56, [97, 56]), true);
});

test('a price in mainnet $U is hired on mainnet, when mainnet is open', () => {
  assert.equal(escrowChainForHire(MAINNET_U, [97, 56]), 56);
  // Closed: no escrow can pay it, so it is not hireable rather than sent to testnet.
  assert.equal(escrowChainForHire(MAINNET_U, [97]), null);
});

test('a price in testnet $U stays on testnet', () => {
  assert.equal(escrowChainForHire(TESTNET_U, [97, 56]), 97);
  assert.equal(escrowChainForHire(TESTNET_U, [56]), null);
});

test('a price in a token no escrow settles in is payable nowhere', () => {
  assert.equal(escrowChainForCurrency(USDT, [97, 56]), null);
  assert.equal(escrowChainForCurrency('not an address', [97, 56]), null);
});

test('no signed price goes to testnet, never mainnet', () => {
  assert.equal(escrowChainForHire(null, [97, 56]), 97);
  assert.equal(escrowChainForHire(undefined, [56]), null);
});

test('the pinned tokens are the ones the escrows settle in', () => {
  assert.equal(ESCROW_PAYMENT_TOKEN[56].toLowerCase(), MAINNET_U);
  assert.equal(ESCROW_PAYMENT_TOKEN[97], TESTNET_U);
});

test('a mainnet price is offered on mainnet first and on testnet as a free trial', () => {
  assert.deepEqual(escrowOptionsForHire(MAINNET_U, [97, 56]), [56, 97]);
  assert.deepEqual(escrowOptionsForHire(MAINNET_U, [97]), [97]);
  assert.deepEqual(escrowOptionsForHire(MAINNET_U, [56]), [56]);
});

test('anything else has only testnet, as before', () => {
  assert.deepEqual(escrowOptionsForHire(null, [97, 56]), [97]);
  assert.deepEqual(escrowOptionsForHire(TESTNET_U, [97, 56]), [97]);
  assert.deepEqual(escrowOptionsForHire(USDT, [97, 56]), [97]);
  assert.deepEqual(escrowOptionsForHire(USDT, [56]), []);
});

/*
 * What Pokter tells an agent about where its job would be funded.
 *
 * Nothing used to say, so an agent that prices per chain had to guess —
 * and one of Pokter's own quoted the mainnet token for a testnet listing,
 * signed honestly and impossible to fund.
 */
test('an agent is asked to price in its own registry chain, when Pokter settles there', () => {
  assert.deepEqual(settlementHint({ chain_id: 56 }, [97, 56]), { chain_id: 56, escrow_chains: [97, 56] });
  assert.deepEqual(settlementHint({ chain_id: 97 }, [97, 56]), { chain_id: 97, escrow_chains: [97, 56] });
});

test('an agent on a chain Pokter cannot fund is asked for one it can', () => {
  assert.equal(settlementHint({ chain_id: 56 }, [97]).chain_id, 97);
  assert.equal(settlementHint({ chain_id: 1 }, [97, 56]).chain_id, 97);
});
