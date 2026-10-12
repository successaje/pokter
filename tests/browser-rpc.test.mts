import assert from 'node:assert/strict';
import test from 'node:test';

import { browserRpcUrls, RECEIPT_POLL_MS } from '../src/lib/wallet/browser-rpc';

/*
 * Which endpoints the browser may read through during a hire.
 *
 * A mainnet hire failed three times at "Creating job": the transaction
 * landed, the receipt poll was rate-limited to 403, and the flow aborted
 * on a step that had succeeded. Jobs 56977-56979 are the wreckage.
 */

test('mainnet leads with the chain’s own dataseed, not the rate-limited one', () => {
  const urls = browserRpcUrls(56, 'https://bsc-rpc.publicnode.com');
  assert.equal(urls[0], 'https://bsc-dataseed.bnbchain.org');
  assert.ok(urls.length > 1, 'a single endpoint is the failure being fixed');
  /* Kept, not dropped: it works until it is asked too often. */
  assert.ok(urls.includes('https://bsc-rpc.publicnode.com'));
});

test('testnet keeps a list too', () => {
  const urls = browserRpcUrls(97, 'https://bsc-testnet-rpc.publicnode.com');
  assert.ok(urls.length > 1);
  assert.ok(urls.every((url) => url.startsWith('https://')));
});

test('the caller’s own endpoint is never lost', () => {
  const custom = 'https://rpc.example/private';
  assert.ok(browserRpcUrls(56, custom).includes(custom));
  /* An unlisted chain falls back to exactly what the caller had. */
  assert.deepEqual(browserRpcUrls(999, custom), [custom]);
});

test('no endpoint appears twice, which would waste a fallback slot', () => {
  for (const chainId of [56, 97]) {
    const urls = browserRpcUrls(chainId, 'https://bsc-rpc.publicnode.com');
    assert.equal(new Set(urls).size, urls.length, `chain ${chainId}`);
  }
});

test('the receipt poll is slower than viem’s default', () => {
  assert.ok(RECEIPT_POLL_MS > 4_000, 'the default is what the endpoint throttled');
});
