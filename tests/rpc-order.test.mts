import assert from 'node:assert/strict';
import test from 'node:test';

import { rpcOrder } from '../src/lib/chain/rpc-order';

const PUBLIC = ['https://bsc-rpc.publicnode.com'];
const ARCHIVE = 'https://bsc-mainnet.nodereal.io/v1/key';

test('the present asks public nodes first and spends the free tier only when they refuse', () => {
  assert.deepEqual(rpcOrder('present', PUBLIC, ARCHIVE).map((r) => r.url), [...PUBLIC, ARCHIVE]);
});

test('the past asks NodeReal first, because a public node may answer an old range with nothing', () => {
  assert.deepEqual(rpcOrder('history', PUBLIC, ARCHIVE).map((r) => r.url), [ARCHIVE, ...PUBLIC]);
});

test('without a key both are the public nodes alone, as before', () => {
  assert.deepEqual(rpcOrder('history', PUBLIC, null), [{ url: PUBLIC[0], public: true }]);
  assert.deepEqual(rpcOrder('present', PUBLIC, null), [{ url: PUBLIC[0], public: true }]);
});

test('every mainnet history read goes through the history transport', async () => {
  const { readFileSync } = await import('node:fs');
  const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  /* Asserted on source: these modules are server-only and cannot be imported here. */
  assert.match(source('lib/erc8183/history-client.ts'), /historyTransport\(/);
  const attribution = source('lib/erc8183/attribute-owners.ts');
  assert.doesNotMatch(attribution, /publicRpcUrl|registryClient\(/, 'receipts and past owners are refused by public mainnet nodes');
  assert.match(attribution, /historyClient\(/);
});
