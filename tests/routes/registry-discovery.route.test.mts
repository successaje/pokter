import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/*
 * One discovery pass on a real store, with the registry and the probe
 * replaced: what is read, queued, tried, promoted and backed off.
 */
const dir = mkdtempSync(join(tmpdir(), 'pokter-discovery-'));
process.env.PROBE_DB_PATH = join(dir, 'probes.db');

const { getProbeStore } = (await import('../../src/lib/history/store')) as typeof import('../../src/lib/history/store');
const { runDiscovery } = (await import('../../src/lib/history/sweep')) as typeof import('../../src/lib/history/sweep');

const store = getProbeStore();
const row = (tokenId: string, minutesAgo: number, protocols: string[] | null) => ({ token_id: tokenId, chain_id: 97, created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(), supported_protocols: protocols });

test('a first pass seeds the cursor from the newest page, queues what can be called, and tries a few', async () => {
  const page = [row('10', 1, ['A2A']), row('11', 2, ['Web']), row('12', 3, ['MCP', 'Web']), row('13', 4, null)];
  let listCalls = 0;
  const outcome = await runDiscovery(97, { deadlineAt: Date.now() + 10_000 }, {
    store,
    listAgents: (async () => {
      listCalls += 1;
      return { items: page, total: page.length } as never;
    }) as never,
    getAgent: (async (_chain: number, tokenId: string) => ({ token_id: tokenId, chain_id: 97, services: { a2a: { endpoint: `https://agent-${tokenId}.example/card.json` } } })) as never,
    probeAgent: (async (agent: { token_id: string }) => ({ answered: agent.token_id === '10' ? 1 : 0 })) as never,
  });
  assert.equal(listCalls, 1, 'one page on the first run: no backfill');
  assert.equal(outcome.read, 4);
  assert.equal(outcome.queued, 2, 'A2A and MCP, not a website-only or undeclared registration');
  assert.equal(outcome.tried, 2);
  assert.equal(outcome.promoted, 1);
  assert.deepEqual(store.discoveredAgents(), [{ chainId: 97, tokenId: '10' }], 'the one that answered joins the roster');
  const counts = store.discoveryCounts(97);
  assert.equal(counts.promoted, 1);
  assert.equal(counts.queued, 1, 'the silent one waits for its next try');
  assert.equal(counts.cursor, page[0].created_at);
  assert.deepEqual(store.dueDiscoveries(97, new Date().toISOString(), 10), [], 'and is not due again for an hour');
});

test('a later pass reads only what is new, and a registration already queued is not queued twice', async () => {
  const page = [row('14', 0, ['A2A']), row('10', 1, ['A2A']), row('12', 3, ['MCP'])];
  const outcome = await runDiscovery(97, { deadlineAt: Date.now() + 10_000 }, {
    store,
    listAgents: (async () => ({ items: page, total: page.length })) as never,
    getAgent: (async () => null) as never,
    probeAgent: (async () => ({ answered: 0 })) as never,
  });
  assert.equal(outcome.queued, 1, 'only 14 is new to the queue');
  assert.equal(outcome.tried, 0, 'a registry lookup that fails is not the agent’s silence, and costs it no attempt');
  assert.equal(store.discoveryCounts(97).queued, 2);
});

test('a pass whose time is up reads nothing and tries nothing', async () => {
  let called = false;
  const outcome = await runDiscovery(97, { deadlineAt: Date.now() - 1 }, {
    store,
    listAgents: (async () => {
      called = true;
      return { items: [], total: 0 };
    }) as never,
  });
  assert.equal(called, false);
  assert.equal(outcome.tried, 0);
});

test('a listing with no agent bound yet is counted as waiting and tried again in a week', async () => {
  const listing = { token_id: '20', chain_id: 56, created_at: new Date(Date.now() - 60_000).toISOString(), supported_protocols: ['A2A'] };
  const outcome = await runDiscovery(56, { deadlineAt: Date.now() + 10_000 }, {
    store,
    listAgents: (async () => ({ items: [listing], total: 1 })) as never,
    getAgent: (async (_chain: number, tokenId: string) => ({ token_id: tokenId, chain_id: 56, services: { a2a: { endpoint: `https://listing.example/agents/${tokenId}/card` } } })) as never,
    probeAgent: (async () => ({ answered: 0, probes: [{ ok: false, awaitingAgent: true }] })) as never,
  });
  assert.equal(outcome.tried, 1);
  assert.equal(outcome.waiting, 1);
  assert.equal(outcome.dropped, 0, 'not left alone: its owner may still bind an agent');
  const day = 86_400_000;
  assert.deepEqual(store.dueDiscoveries(56, new Date(Date.now() + 6 * day).toISOString(), 10), [], 'not tried again within the week');
  assert.deepEqual(store.dueDiscoveries(56, new Date(Date.now() + 7 * day + 60_000).toISOString(), 10), [{ chainId: 56, tokenId: '20', attempts: 1 }]);
});
