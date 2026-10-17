import assert from 'node:assert/strict';
import test from 'node:test';

import { escrowAvailabilityLine } from '../src/lib/network/presentation';

test('both escrows live reads as mainnet, with testnet offered', () => {
  assert.equal(escrowAvailabilityLine([56, 97]), 'Live on BNB Chain Mainnet · Testnet available');
  assert.equal(escrowAvailabilityLine([97, 56]), 'Live on BNB Chain Mainnet · Testnet available', 'order does not matter');
});

test('it stops claiming mainnet when mainnet escrow is off', () => {
  /*
   * The reason this is derived and not written out: a hardcoded
   * "Live on BNB Chain Mainnet" outlives the thing it describes. Turn the
   * mainnet escrow off and the front page keeps asserting it.
   */
  assert.equal(escrowAvailabilityLine([97]), 'On BNB Testnet, in test tokens');
});

test('mainnet alone does not offer a testnet trial', () => {
  // The trial happens on testnet; with testnet off there is nothing to offer.
  assert.equal(escrowAvailabilityLine([56]), 'Live on BNB Chain Mainnet');
});

test('with no escrow enabled it says nothing rather than something false', () => {
  assert.equal(escrowAvailabilityLine([]), null);
});
