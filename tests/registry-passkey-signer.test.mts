import assert from 'node:assert/strict';
import test from 'node:test';

import { passkeyChainRefusal } from '../src/lib/registry/passkey-chain';

/*
 * A passkey wallet signs only on the networks it was set up on and the site
 * has opened, so a request to publish anywhere else cannot be signed. Finding
 * that out inside the SDK, after the first transaction has already minted an
 * identity, is the expensive way to learn it — so it is refused before
 * anything is signed.
 */
test('a passkey may publish on a network it acts on', () => {
  assert.equal(passkeyChainRefusal(97, [97]), null);
  assert.equal(passkeyChainRefusal(56, [56]), null);
  assert.equal(passkeyChainRefusal(56, [97, 56]), null, 'a wallet set up on both, with both opened');
});

test('publishing on another network is refused, and says which wallet to use', () => {
  const message = passkeyChainRefusal(56, [97]);
  assert.ok(message);
  assert.match(message, /passkey wallet publishes on BNB Testnet only/);
  assert.match(message, /Connect a browser wallet to publish on BNB Chain/);
});

test('the refusal names both networks the right way round', () => {
  const message = passkeyChainRefusal(97, [56]);
  assert.ok(message);
  assert.match(message, /publishes on BNB Chain only/);
  assert.match(message, /publish on BNB Testnet/);
});

test('a wallet that acts nowhere is told so, not told a network it cannot use', () => {
  const message = passkeyChainRefusal(97, []);
  assert.ok(message);
  assert.match(message, /publishes nowhere on this site yet/);
});
