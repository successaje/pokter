import assert from 'node:assert/strict';
import test from 'node:test';

import { keccak256, stringToBytes } from 'viem';

import { manifestMatch, sortedKeysText } from '../src/lib/erc8183/manifest-match';

const served = JSON.stringify(
  { version: 1, job_id: 1544, chain_id: 97, response: { content: { trades: [], summary: { trades: 0, paused: true } } }, metadata: { producer: 'nagi' } },
  null,
  2,
);
const hash = (text: string) => keccak256(stringToBytes(text));

test('the exact bytes match exactly', () => {
  assert.equal(manifestMatch(served, hash(served)), 'exact');
});

test('a hash of the same JSON with sorted keys matches, and says so', () => {
  const committed = hash(sortedKeysText(served)!);
  assert.notEqual(committed, hash(served));
  assert.equal(manifestMatch(served, committed), 'sorted-keys');
  assert.equal(manifestMatch(served, committed.toUpperCase().replace('0X', '0x')), 'sorted-keys');
});

test('keys are sorted at every depth, and arrays keep their order', () => {
  assert.equal(sortedKeysText('{"b":{"d":1,"c":2},"a":[3,1]}'), '{"a":[3,1],"b":{"c":2,"d":1}}');
});

test('changed content matches neither way', () => {
  const committed = hash(sortedKeysText(served)!);
  const altered = served.replace('"trades": 0', '"trades": 3');
  assert.equal(manifestMatch(altered, committed), null);
});

test('text that is not JSON can only match exactly', () => {
  assert.equal(manifestMatch('plain answer', hash('plain answer')), 'exact');
  assert.equal(manifestMatch('plain answer', hash('other')), null);
  assert.equal(manifestMatch('plain answer', null), null);
});

/*
 * Halong Yield, job 97:1588: a manifest served with a raw "’" and hashed in
 * the canonical form, which escapes it. The buyer was told it did not match.
 */
test('a hash of the canonical form (sorted, non-ASCII escaped) matches, and is the SDK’s own hash', async () => {
  const { erc8183ManifestHash } = await import('@altananetwork/sdk');
  const { canonicalText } = await import('../src/lib/erc8183/manifest-match');
  const manifest = { version: 1 as const, job_id: 1588, chain_id: 97, contracts: { commerce: '0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE' as const, router: '0xD7d36D66d2F1B608A0F943f722D27e3744f66F25' as const, policy: '0xd6a4217588F6B1F5657a92A3e94E6422aD771cEA' as const }, response: { content: 'Read each protocol’s own API — not an aggregator. 収益 🚀', content_type: 'text/plain' }, metadata: {} };
  const servedRaw = JSON.stringify(manifest);
  const onChain = erc8183ManifestHash(manifest);
  assert.equal(keccak256(stringToBytes(canonicalText(servedRaw)!)), onChain);
  assert.equal(manifestMatch(servedRaw, onChain), 'canonical');
  // The same text without the escapes is what it used to be judged on, and that still does not match on its own.
  assert.notEqual(hash(sortedKeysText(servedRaw)!), onChain);
});

test('canonical matching still refuses changed content', async () => {
  const { erc8183ManifestHash } = await import('@altananetwork/sdk');
  const manifest = { version: 1 as const, job_id: 1588, chain_id: 97, contracts: { commerce: '0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE' as const, router: '0xD7d36D66d2F1B608A0F943f722D27e3744f66F25' as const, policy: '0xd6a4217588F6B1F5657a92A3e94E6422aD771cEA' as const }, response: { content: 'APY 4.1% — Venus', content_type: 'text/plain' }, metadata: {} };
  const onChain = erc8183ManifestHash(manifest);
  const tampered = JSON.stringify({ ...manifest, response: { ...manifest.response, content: 'APY 9.1% — Venus' } });
  assert.equal(manifestMatch(tampered, onChain), null);
});
