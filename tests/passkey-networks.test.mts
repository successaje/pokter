import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePasskeyChains, passkeyActionChains, passkeyActsOn, storedPasskeyChains } from '../src/lib/wallet/passkey-networks';

/*
 * A passkey wallet's networks are fixed when it is made: Altana discards the
 * key that sets a network up. So the record says which networks a wallet has,
 * and the site says which it has opened; a wallet acts where both agree.
 */

test('unset settings mean the build’s one network, exactly as before', () => {
  assert.deepEqual(parsePasskeyChains(undefined, 97), [97]);
  assert.deepEqual(parsePasskeyChains('', 97), [97]);
  assert.deepEqual(parsePasskeyChains('1, 8453', 97), [97], 'unknown networks are ignored, never an empty list');
});

test('both networks, with the build’s network first as the client’s default', () => {
  assert.deepEqual(parsePasskeyChains('56,97', 97), [97, 56]);
  assert.deepEqual(parsePasskeyChains('97, 56, 97', 97), [97, 56]);
  assert.deepEqual(parsePasskeyChains('56', 97), [56]);
});

test('a wallet recorded before networks were recorded has the build’s network alone', () => {
  assert.deepEqual(storedPasskeyChains(undefined, 97), [97]);
  assert.deepEqual(storedPasskeyChains('97,56', 97), [97], 'not a list');
  assert.deepEqual(storedPasskeyChains([], 97), [97], 'never a wallet that acts nowhere');
  assert.deepEqual(storedPasskeyChains([97, 56, 56, 1], 97), [97, 56]);
});

test('a wallet acts only where it was set up and the site has opened passkeys', () => {
  const both = { chains: [97, 56] };
  const testnetOnly = { chains: [97] };
  assert.equal(passkeyActsOn(both, 97, [97]), true);
  assert.equal(passkeyActsOn(both, 56, [97]), false, 'set up on mainnet, but mainnet is not opened');
  assert.equal(passkeyActsOn(both, 56, [97, 56]), true);
  assert.equal(passkeyActsOn(testnetOnly, 56, [97, 56]), false, 'opened, but this wallet was never set up there');
  assert.equal(passkeyActsOn(null, 97, [97]), false);
  assert.deepEqual(passkeyActionChains(both, [97]), [97]);
  assert.deepEqual(passkeyActionChains(both, [97, 56]), [97, 56]);
});
