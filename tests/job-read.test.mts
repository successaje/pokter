import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { JOB_STATUS } from '@altananetwork/sdk';

import { publicReadUrls, readUrlsKeeping } from '../src/lib/chain/transport';
import { GET_JOB_ABI, JOB_STATUS_NAMES, readErc8183Job } from '../src/lib/erc8183/get-job';
import { browserRpcUrls } from '../src/lib/wallet/browser-rpc';

/*
 * Job reads, through several nodes where the SDK's has one: the server's
 * and the browser's.
 *
 * The two readers are asserted on source: they share a module graph with
 * the SDK, which neither test runner can load from a source module
 * (altana-sdk#88). What decides which nodes they ask, and the read they
 * share, are tested as code.
 */

const SDK_MAINNET_NODE = 'https://bsc-rpc.publicnode.com';
const SDK_TESTNET_NODE = 'https://bsc-testnet-rpc.publicnode.com';

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

test('a browser job read has more than one node on each chain, the SDK’s among them', () => {
  for (const [chainId, node] of [[56, SDK_MAINNET_NODE], [97, SDK_TESTNET_NODE]] as const) {
    const urls = browserRpcUrls(chainId, node);
    assert.ok(urls.length > 1, `chain ${chainId}: a single node is the failure being fixed`);
    assert.ok(urls.includes(node), `chain ${chainId}: the SDK’s node is kept`);
    assert.equal(new Set(urls).size, urls.length);
  }
  /* Mainnet's SDK node throttles a browser, so it is not asked first. */
  assert.notEqual(browserRpcUrls(56, SDK_MAINNET_NODE)[0], SDK_MAINNET_NODE);
});

test('the shared read has the SDK’s statuses, in the kernel’s order', () => {
  assert.deepEqual([...JOB_STATUS_NAMES], [...JOB_STATUS]);
});

test('the shared read asks the escrow for the job and answers as the SDK does', async () => {
  const commerce = '0xEa4DAa3100A767e86FDed867729ae7446476EBA6';
  const onChain = {
    id: 57137n, client: '0x0000000000000000000000000000000000000001', provider: '0x0000000000000000000000000000000000000002',
    evaluator: '0x0000000000000000000000000000000000000003', description: 'a brief', budget: 10n ** 18n, expiredAt: 1_800_000_000n,
    status: 2, hook: '0x0000000000000000000000000000000000000004', submittedAt: 1_799_000_000n, deliverable: `0x${'ab'.repeat(32)}`,
  } as const;
  const asked: unknown[] = [];
  const client = (status: number) => ({
    readContract: async (args: unknown) => {
      asked.push(args);
      return { ...onChain, status };
    },
  });

  const job = await readErc8183Job(client(2) as never, commerce, 57137n);
  assert.deepEqual(asked, [{ address: commerce, abi: GET_JOB_ABI, functionName: 'getJob', args: [57137n] }]);
  assert.deepEqual(job, { ...onChain, statusName: 'SUBMITTED' });

  /* A status the kernel adds later reads UNKNOWN rather than throwing. */
  assert.equal((await readErc8183Job(client(9) as never, commerce, 57137n)).statusName, 'UNKNOWN');
});

test('a read the nodes refuse reaches the caller, as the SDK’s did', async () => {
  const refused = { readContract: async () => { throw new Error('HTTP request failed. Status: 403'); } };
  await assert.rejects(readErc8183Job(refused as never, '0xEa4DAa3100A767e86FDed867729ae7446476EBA6', 1n), /403/);
});

const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the server reader asks through the fallback, with the override on mainnet only', () => {
  const reader = source('lib/erc8183/job-read.ts');
  assert.match(reader, /^import 'server-only';/m);
  assert.match(reader, /readTransport\(network\.chainId, urls\)/);
  assert.match(reader, /readUrlsKeeping\(network\.chainId, network\.publicRpcUrl, network\.chainId === 56 \? process\.env\.BSC_MAINNET_RPC_URL : undefined\)/);
  assert.doesNotMatch(reader, /http\(network\.publicRpcUrl\)/, 'the SDK’s single node is what this replaces');
  assert.match(reader, /readErc8183Job\(jobClient\(network\), /);
  assert.match(reader, /export async function getErc8183Job\(network: NetworkConfig, jobId: bigint\): Promise<Erc8183Job>/);
});

test('the browser reader asks the hire’s nodes, and nothing that only the server has', () => {
  const reader = source('lib/erc8183/job-read-browser.ts');
  assert.doesNotMatch(reader, /^import 'server-only'/m, 'it is bundled for the browser');
  assert.doesNotMatch(reader, /process\.env|nodeRealUrl|readTransport|'@\/lib\/chain\/rpc'/, 'NodeReal’s key is server-only');
  assert.match(reader, /fallback\(browserRpcUrls\(network\.chainId, network\.publicRpcUrl\)\.map\(\(url\) => http\(url, \{ retryCount: 1 \}\)\)\)/);
  assert.doesNotMatch(reader, /http\(network\.publicRpcUrl\)/, 'the SDK’s single node is what this replaces');
  assert.match(reader, /readErc8183Job\(jobClient\(network\), /);
  assert.match(reader, /export async function getErc8183Job\(network: NetworkConfig, jobId: bigint\): Promise<Erc8183Job>/);
});

test('nothing reads a job through the SDK’s single node, and the browser never imports the server’s reader', () => {
  const BROWSER = ['src/lib/hire/useHire.ts', 'src/lib/jobs/useJobActions.ts', 'src/lib/wallet/external.ts'];
  const throughSdk: string[] = [];
  const serverReaderOffBrowser: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name)) {
        const text = readFileSync(path, 'utf8');
        const fromSdk = [
          ...text.matchAll(/import\s+\{([^}]*)\}\s*from\s*'@altananetwork\/sdk'/g),
          ...text.matchAll(/const\s+\{([^}]*)\}\s*=\s*await\s+import\('@altananetwork\/sdk'\)/g),
        ];
        if (fromSdk.some(([, names]) => /\bgetErc8183Job\b/.test(names))) throughSdk.push(path);
        /* The server's reader is for code that never ships to a browser: a route, or a module marked server-only. */
        if (/from '@\/lib\/erc8183\/job-read'/.test(text) && !path.startsWith('src/app/api/') && !/^import 'server-only';/m.test(text)) {
          serverReaderOffBrowser.push(path);
        }
      }
    }
  };
  walk('src');
  assert.deepEqual(throughSdk, [], 'import getErc8183Job from @/lib/erc8183/job-read on the server, or job-read-browser in the browser');
  assert.deepEqual(serverReaderOffBrowser, [], 'only server code imports @/lib/erc8183/job-read');
  for (const path of BROWSER) {
    const text = readFileSync(path, 'utf8');
    assert.doesNotMatch(text, /^import 'server-only'/m, `${path} runs in the browser`);
    assert.match(text, /^import \{ getErc8183Job \} from '@\/lib\/erc8183\/job-read-browser';$/m, `${path} reads jobs through the browser’s nodes`);
  }
});
