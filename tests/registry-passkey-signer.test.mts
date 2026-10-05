import assert from 'node:assert/strict';
import test from 'node:test';

import { passkeyChainRefusal } from '../src/lib/registry/passkey-chain';

/*
 * The passkey client is built for one network, so a request to publish on
 * the other cannot be signed. Finding that out inside the SDK, after the
 * first transaction has already minted an identity, is the expensive way
 * to learn it — so it is refused before anything is signed.
 */
test('a passkey may publish on the chain its client is built for', () => {
  assert.equal(passkeyChainRefusal(97, 97), null);
  assert.equal(passkeyChainRefusal(56, 56), null);
});

test('publishing on the other chain is refused, and says which wallet to use', () => {
  const message = passkeyChainRefusal(56, 97);
  assert.ok(message);
  assert.match(message, /passkey wallet publishes on BNB Testnet only/);
  assert.match(message, /Connect a browser wallet to publish on BNB Chain/);
});

test('the refusal names both chains the right way round', () => {
  const message = passkeyChainRefusal(97, 56);
  assert.ok(message);
  assert.match(message, /publishes on BNB Chain only/);
  assert.match(message, /publish on BNB Testnet/);
});
