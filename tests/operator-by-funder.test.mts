import assert from 'node:assert/strict';
import test from 'node:test';

import { lookupFirstFunder } from '../src/lib/funding/funder';
import { operatorResolver } from '../src/lib/funding/operator';
import { mostReliable } from '../src/lib/search/order';
import type { SearchableAgent } from '../src/lib/search/match';

const F = '0x' + 'f'.repeat(40);
const owner = (n: number) => '0x' + String(n).padStart(40, '0');

/*
 * A fake NodeReal that enforces what the real one does: a range under
 * 2,000,000 blocks, nothing past its index, and historical nonces. The
 * earlier fake accepted a request from block 0 to "latest" that the real
 * API refuses, which is how every lookup failed in production unnoticed.
 */
function fakeNodeReal(opts: { head: number; indexed: number; firstSend: number | null; fundedAt: number | null; funder: string }) {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const { method, params } = JSON.parse(String(init.body)) as { method: string; params: unknown[] };
    calls.push({ method, params });
    const reply = (body: unknown) => new Response(JSON.stringify(body));
    if (method === 'eth_blockNumber') return reply({ result: `0x${opts.head.toString(16)}` });
    if (method === 'eth_getTransactionCount') {
      const block = Number.parseInt(String(params[1]), 16);
      return reply({ result: opts.firstSend !== null && block >= opts.firstSend ? '0x1' : '0x0' });
    }
    if (method === 'nr_getAssetTransfers') {
      const q = params[0] as { fromBlock: string; toBlock: string };
      const from = Number.parseInt(q.fromBlock, 16);
      const to = Number.parseInt(q.toBlock, 16);
      if (!Number.isFinite(to) || to <= from) return reply({ error: { message: 'invalid fromBlock and toBlock param: from must be less than to' } });
      if (to - from >= 2_000_000) return reply({ error: { message: 'invalid fromBlock and toBlock param: range must be less than 2000000' } });
      if (to > opts.indexed) return reply({ error: { message: 'blockNum not reached' } });
      const hit = opts.fundedAt !== null && opts.fundedAt >= from && opts.fundedAt <= to;
      return reply({ result: { transfers: hit ? [{ from: opts.funder }] : [] } });
    }
    return reply({ error: { message: `unexpected ${method}` } });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

test('finds the first funder of a wallet within the API limits', async () => {
  const api = fakeNodeReal({ head: 128_000_000, indexed: 127_999_000, firstSend: 90_000_123, fundedAt: 90_000_100, funder: '0xABCDEF0000000000000000000000000000000001' });
  const out = await lookupFirstFunder('0xAbC0000000000000000000000000000000000001', { apiKey: 'k', fetchImpl: api.fetchImpl });
  assert.equal(out.funder, '0xabcdef0000000000000000000000000000000001');
  const transfers = api.calls.filter((c) => c.method === 'nr_getAssetTransfers').map((c) => c.params[0] as Record<string, string>);
  assert.ok(transfers.length >= 1);
  assert.equal(transfers[0].toAddress, '0xabc0000000000000000000000000000000000001');
  assert.equal(transfers[0].order, 'asc');
});

test('a funding long before the first send is found by stepping back', async () => {
  const api = fakeNodeReal({ head: 128_000_000, indexed: 127_999_000, firstSend: 90_000_000, fundedAt: 86_500_000, funder: '0x' + 'e'.repeat(40) });
  assert.equal((await lookupFirstFunder(owner(1), { apiKey: 'k', fetchImpl: api.fetchImpl })).funder, '0x' + 'e'.repeat(40));
});

test('a wallet that received nothing has no funder; an API error throws rather than recording one', async () => {
  const empty = fakeNodeReal({ head: 128_000_000, indexed: 127_999_000, firstSend: null, fundedAt: null, funder: F });
  assert.equal((await lookupFirstFunder(owner(1), { apiKey: 'k', fetchImpl: empty.fetchImpl })).funder, null);
  const failing = (async () => new Response(JSON.stringify({ error: { message: 'limit' } }))) as unknown as typeof fetch;
  await assert.rejects(lookupFirstFunder(owner(1), { apiKey: 'k', fetchImpl: failing }));
  const down = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
  await assert.rejects(lookupFirstFunder(owner(1), { apiKey: 'k', fetchImpl: down }));
});

test('wallets first funded from the same address are one operator', () => {
  const funders = new Map([[owner(1), F], [owner(2), F], [owner(3), null]]);
  const of = operatorResolver([owner(1), owner(2), owner(3), owner(4)], funders);
  assert.equal(of(owner(1)), of(owner(2)));
  assert.notEqual(of(owner(3)), of(owner(1)));
  assert.equal(of(owner(4)), `owner:${owner(4)}`);
});

test('a funder of many wallets is treated as public (a faucet or exchange) and merges nobody', () => {
  const owners = Array.from({ length: 12 }, (_, i) => owner(i + 1));
  const funders = new Map(owners.map((o) => [o, F] as const));
  const of = operatorResolver(owners, funders, { maxFanOut: 10 });
  assert.notEqual(of(owner(1)), of(owner(2)));
  assert.equal(of(owner(1)), `owner:${owner(1)}`);
});

function agent(name: string, ownerAddress: string): SearchableAgent {
  return {
    listing: { agent: { name, token_id: name, chain_id: 56, owner_address: ownerAddress }, attestationCount: 0, quote: null },
    record: { totalProbes: 52, totalAnswered: 52, windows: [{ label: '7d', days: 7, probes: 52, answered: 52, ratio: 1, medianMs: 50 }] },
    history: { jobs: 0, completed: 0 },
  } as unknown as SearchableAgent;
}

test('the strip keeps one agent per funder-grouped operator', () => {
  const a = agent('house-1', owner(1));
  const b = agent('house-2', owner(2));
  const c = agent('independent', owner(3));
  const of = operatorResolver([owner(1), owner(2), owner(3)], new Map([[owner(1), F], [owner(2), F]]));
  const names = mostReliable([a, b, c], 5, of).map((x) => x.listing.agent.name);
  assert.deepEqual(names, ['house-1', 'independent']);
});
