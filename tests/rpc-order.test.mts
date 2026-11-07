import assert from 'node:assert/strict';
import test from 'node:test';

import { rpcOrder } from '../src/lib/chain/rpc-order';
import { publicReadUrls } from '../src/lib/chain/transport';

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

test('a present read has more than one public node to try, on both networks', () => {
  for (const chainId of [56, 97]) {
    const urls = publicReadUrls(chainId);
    assert.ok(urls.length > 1, `chain ${chainId}: a single node is the failure being fixed`);
    assert.equal(new Set(urls).size, urls.length, `chain ${chainId}: no node twice`);
  }
});

test('an operator’s own node is asked first and not asked twice', () => {
  const own = 'https://rpc.example/private';
  assert.deepEqual(publicReadUrls(56, own), [own, ...publicReadUrls(56)]);
  const listed = publicReadUrls(56)[1];
  assert.deepEqual(publicReadUrls(56, listed)[0], listed);
  assert.equal(publicReadUrls(56, listed).filter((url) => url === listed).length, 1);
  /* Unset or blank is no override. */
  assert.deepEqual(publicReadUrls(56, '  '), publicReadUrls(56));
});

test('the escrow index reads through the fallback, not one node', async () => {
  const { readFileSync } = await import('node:fs');
  /* Asserted on source: the indexer is server-only and cannot be imported here. */
  const indexer = readFileSync(new URL('../src/lib/quest/indexer.ts', import.meta.url), 'utf8');
  assert.match(indexer, /readTransport\(chainId, rpcs\)/);
  assert.match(indexer, /publicReadUrls\(56, process\.env\.BSC_MAINNET_RPC_URL\)/);
  assert.doesNotMatch(indexer, /transport: http\(/);
});
