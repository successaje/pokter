import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { batchId, fundingCoordinator, reconcileAttempt, type AttemptChainReader, type KeyValue } from '../src/lib/hire/funding-journal';

/*
 * A batched hire's id, from the answer to `wallet_sendCalls` version 2.0.0,
 * which is `{ id }`, not the id itself. Stored whole, it could not be
 * followed in the wallet, and the hire page crashed on it at every visit.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const WALLET = '0x0000000000000000000000000000000000000abc';

function memory(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

test('the batch id is read from either answer the wallet gives', () => {
  assert.equal(batchId({ id: '0x1234abcd' }), '0x1234abcd', 'version 2.0.0');
  assert.equal(batchId({ id: '0x1234abcd', capabilities: {} }), '0x1234abcd');
  assert.equal(batchId('0x1234abcd'), '0x1234abcd', 'version 1');
  for (const nothing of [null, undefined, '', {}, { id: 7 }, 42]) assert.equal(batchId(nothing), null);
});

test('a record stored with the whole answer is repaired when read, so the page renders and it can be settled', async () => {
  const kv = memory();
  const stored = {
    attemptId: 'tab:2026-10-31T21:35:00.000Z:abc', ownerTab: 'tab', wallet: WALLET, chainId: 56, provider: '0x0000000000000000000000000000000000000def',
    agent: { chainId: 56, tokenId: '374112', name: 'Cresthold by Pokter' }, task: 'task', description: 'brief + quote', token: '0x0000000000000000000000000000000000000001',
    amountRaw: '100000000000000000', fundableUntil: 1_800_000_000, startedAt: '2026-10-31T21:35:00.000Z', updatedAt: '2026-10-31T21:35:05.000Z',
    predictedJobId: '57138', jobId: null, callsId: { id: '0xbatch' }, txHashes: [], prompt: 'batch', state: 'pending',
  };
  kv.setItem(`pokter:funding-attempt:56:${WALLET}`, JSON.stringify(stored));
  const attempt = fundingCoordinator(kv, null, 'tab').read(WALLET, 56)!;
  assert.equal(attempt.callsId, '0xbatch');
  assert.equal(`batch ${attempt.callsId!.slice(0, 10)}…`, 'batch 0xbatch…', 'what the pending notice renders');
  // And the wallet is asked about the batch by its id, not by the object.
  const asked: unknown[] = [];
  const read: AttemptChainReader = {
    receipt: async () => null,
    txState: async () => 'unknown',
    job: async () => { throw new Error('not reached'); },
    jobIdFrom: () => null,
    calls: async (id) => { asked.push(id); return { status: 'pending', logs: [] }; },
  };
  await reconcileAttempt(attempt, read).catch(() => null);
  assert.deepEqual(asked, ['0xbatch']);
});

test('the hire sends the id, and a batch the wallet gives no id for is settled from the chain', () => {
  const wallet = code('lib/wallet/external.ts');
  assert.doesNotMatch(wallet, /\}\] \}\)\) as string;/, 'the answer is not cast to a string');
  assert.match(wallet, /const callsId = batchId\(sent\);/);
  assert.match(wallet, /if \(!callsId\) \{[\s\S]{0,400}throw new Error\(/);
  assert.ok(wallet.indexOf("ask('batch')") < wallet.indexOf('const callsId = batchId(sent);'), 'thrown while the batch prompt is the open one, so the attempt is kept');
});
