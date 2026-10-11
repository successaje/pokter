import assert from 'node:assert/strict';
import test from 'node:test';

import { lookupFirstFunder, NODEREAL_ENDPOINT } from '../src/lib/funding/funder';
import { operatorResolver } from '../src/lib/funding/operator';
import { mostReliable } from '../src/lib/search/order';
import type { SearchableAgent } from '../src/lib/search/match';

const F = '0x' + 'f'.repeat(40);
const owner = (n: number) => '0x' + String(n).padStart(40, '0');

test('the lookup asks for the first incoming transfer and returns its sender, lower-cased', async () => {
  let sent: { url: string; body: Record<string, unknown> } | null = null;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    sent = { url, body: JSON.parse(String(init.body)) };
    return new Response(JSON.stringify({ result: { transfers: [{ from: '0xABCDEF0000000000000000000000000000000001' }] } }));
  }) as unknown as typeof fetch;
  const out = await lookupFirstFunder('0xAbC0000000000000000000000000000000000001', { apiKey: 'k', fetchImpl });
  assert.equal(out.funder, '0xabcdef0000000000000000000000000000000001');
  assert.equal(sent!.url, `${NODEREAL_ENDPOINT}k`);
  const params = (sent!.body.params as Array<Record<string, unknown>>)[0];
  assert.equal(sent!.body.method, 'nr_getAssetTransfers');
  assert.equal(params.order, 'asc');
  assert.equal(params.maxCount, '0x1');
  assert.equal(params.toAddress, '0xabc0000000000000000000000000000000000001');
});

test('a wallet that received nothing has no funder; an API error throws rather than recording one', async () => {
  const empty = (async () => new Response(JSON.stringify({ result: { transfers: [] } }))) as unknown as typeof fetch;
  assert.equal((await lookupFirstFunder(owner(1), { apiKey: 'k', fetchImpl: empty })).funder, null);
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
