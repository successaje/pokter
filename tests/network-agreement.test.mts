import assert from 'node:assert/strict';
import test from 'node:test';

import { IS_TESTNET, assertNetworkAgreement } from '../src/lib/network/presentation';

test('a server signer refuses a different network from the interface', () => {
  const original = process.env.ALTANA_NETWORK;
  try {
    process.env.ALTANA_NETWORK = IS_TESTNET ? 'bnb-testnet' : 'bnb';
    assert.doesNotThrow(assertNetworkAgreement);
    process.env.ALTANA_NETWORK = IS_TESTNET ? 'bnb' : 'bnb-testnet';
    assert.throws(assertNetworkAgreement, /Network mismatch/);
  } finally {
    if (original === undefined) delete process.env.ALTANA_NETWORK;
    else process.env.ALTANA_NETWORK = original;
  }
});
