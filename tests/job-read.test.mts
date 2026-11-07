import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { publicReadUrls, readUrlsKeeping } from '../src/lib/chain/transport';

/*
 * The server's job read, through several nodes where the SDK's has one.
 *
 * The reader itself is asserted on source: it is `server-only`, and the
 * SDK it shares a module graph with cannot be loaded by either test
 * runner (altana-sdk#88). What decides which nodes it asks is pure, and
 * tested as code.
 */

const SDK_MAINNET_NODE = 'https://bsc-rpc.publicnode.com';

test('a mainnet job read has more than one node, and keeps the SDK’s own', () => {
  const urls = readUrlsKeeping(56, SDK_MAINNET_NODE);
  assert.ok(urls.length > 1, 'a single node is the failure being fixed');
  assert.ok(urls.includes(SDK_MAINNET_NODE));
  assert.equal(new Set(urls).size, urls.length);
  assert.deepEqual(urls, publicReadUrls(56), 'the SDK’s node is already listed, so nothing is added');
});

test('a node the list lacks is kept, last; an unlisted chain reads from it alone, as before', () => {
  assert.deepEqual(readUrlsKeeping(56, 'https://node.example').at(-1), 'https://node.example');
  assert.deepEqual(readUrlsKeeping(8453, 'https://base.example'), ['https://base.example']);
});

test('an operator’s own node is asked first', () => {
  const own = 'https://rpc.example/private';
  assert.equal(readUrlsKeeping(56, SDK_MAINNET_NODE, own)[0], own);
});

const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the reader asks through the fallback, with the override on mainnet only, and answers as the SDK does', () => {
  const reader = source('lib/erc8183/job-read.ts');
  assert.match(reader, /readTransport\(network\.chainId, urls\)/);
  assert.match(reader, /readUrlsKeeping\(network\.chainId, network\.publicRpcUrl, network\.chainId === 56 \? process\.env\.BSC_MAINNET_RPC_URL : undefined\)/);
  assert.doesNotMatch(reader, /http\(network\.publicRpcUrl\)/, 'the SDK’s single node is what this replaces');
  /* The SDK's own mapping, so a call site sees the same `statusName`. */
  assert.match(reader, /statusName: \(JOB_STATUS\[job\.status\] \?\? 'UNKNOWN'\)/);
  assert.match(reader, /export async function getErc8183Job\(network: NetworkConfig, jobId: bigint\): Promise<Erc8183Job>/);
});

test('no server module reads a job through the SDK’s single node', () => {
  /* The browser keeps the SDK's: NodeReal's key never reaches it, and its hire reads have their own list. */
  const BROWSER = new Set(['src/lib/hire/useHire.ts', 'src/lib/jobs/useJobActions.ts', 'src/lib/wallet/external.ts']);
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !BROWSER.has(path)) {
        const imports = readFileSync(path, 'utf8').matchAll(/import\s+\{([^}]*)\}\s*from\s*'@altananetwork\/sdk'/g);
        if ([...imports].some(([, names]) => /\bgetErc8183Job\b/.test(names))) offenders.push(path);
      }
    }
  };
  walk('src');
  assert.deepEqual(offenders, [], 'import getErc8183Job from @/lib/erc8183/job-read on the server');
  /* And the three that keep it are still the browser's. */
  for (const path of BROWSER) assert.doesNotMatch(readFileSync(path, 'utf8'), /^import 'server-only'/m, `${path} runs in the browser`);
});
