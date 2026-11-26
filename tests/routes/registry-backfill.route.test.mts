import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/*
 * The backfill on a real store, with the registry and the probe replaced:
 * what is read, queued, tried once, promoted, left alone and sampled out.
 */
const dir = mkdtempSync(join(tmpdir(), 'pokter-backfill-'));
process.env.PROBE_DB_PATH = join(dir, 'probes.db');

const { getProbeStore } = (await import('../../src/lib/history/store')) as typeof import('../../src/lib/history/store');
const { runDiscovery, runRegistryBackfill } = (await import('../../src/lib/history/sweep')) as typeof import('../../src/lib/history/sweep');
const { BACKFILL_HOST_SAMPLE, BACKFILL_QUEUE_FLOOR, BACKFILL_TRIES } = (await import('../../src/lib/history/discovery')) as typeof import('../../src/lib/history/discovery');

const store = getProbeStore();
const registered = (tokenId: string, day: number, chain = 97) => ({ token_id: tokenId, chain_id: chain, created_at: new Date(Date.UTC(2026, 1, day)).toISOString(), supported_protocols: ['A2A'] });
const soon = () => Date.now() + 10_000;
type ListCall = { cursor?: string; sortBy?: string; sortOrder?: string; hasA2a?: boolean; hasMcp?: boolean; limit?: number };

test('a first run reads the oldest page of the A2A pass, queues what Pokter has not measured, and tries a few once', async () => {
  store.record([{ chainId: 97, tokenId: '3', endpoint: 'https://three.example/card', protocol: 'a2a', ok: true, latencyMs: 90, status: 200, detail: 'ok', probedAt: new Date().toISOString() }]);
  const calls: ListCall[] = [];
  const probed: string[] = [];
  const outcome = await runRegistryBackfill(97, { deadlineAt: soon() }, {
    store,
    listAgents: (async (options: ListCall) => {
      calls.push(options);
      return { items: [registered('1', 5), registered('2', 6), registered('3', 7), registered('4', 8)], total: 4, next_cursor: 'after-4', has_more: true };
    }) as never,
    getAgent: (async (_chain: number, tokenId: string) => ({ token_id: tokenId, chain_id: 97, services: { a2a: { endpoint: `https://agent-${tokenId}.example/card.json` } } })) as never,
    probeAgent: (async (agent: { token_id: string }) => {
      probed.push(agent.token_id);
      return { answered: agent.token_id === '1' ? 1 : 0, probes: [{ ok: agent.token_id === '1' }] };
    }) as never,
  });
  assert.equal(calls.length, 1);
  assert.deepEqual({ ...calls[0], limit: undefined }, { chainId: 97, limit: undefined, sortBy: 'created_at', sortOrder: 'asc', cursor: undefined, hasA2a: true, hasMcp: undefined });
  assert.equal(outcome.pass, 'a2a');
  assert.equal(outcome.read, 4);
  assert.equal(outcome.queued, 3, '3 is already measured');
  assert.deepEqual(probed, ['1', '2', '4'], 'oldest registration first');
  assert.equal(outcome.promoted, 1);
  assert.equal(outcome.dropped, 2);
  assert.deepEqual(store.discoveredAgents(), [{ chainId: 97, tokenId: '1' }], 'the one that answered joins the roster');
  assert.deepEqual(store.trackedAgents(), [{ chainId: 97, tokenId: '3' }], 'a try is not a probe on record: only the sweep writes those');
  assert.equal(store.backfillWaiting(97), 0, 'one try each: nothing is queued again');
  const counts = store.backfillCounts(97);
  assert.deepEqual(counts, { queued: 0, promoted: 1, dropped: 2, sampledOut: 0, pages: 1, passesDone: 0, started: true });
  assert.deepEqual(store.backfillPasses(97), [{ pass: 'a2a', cursor: 'after-4', done: false, pages: 1 }]);
});

test('backfilled registrations stay out of discovery’s own queue and counts', async () => {
  store.enqueueBackfill([{ chainId: 97, tokenId: '50', registeredAt: new Date(Date.UTC(2026, 1, 9)).toISOString() }]);
  assert.deepEqual(store.dueDiscoveries(97, new Date(Date.now() + 365 * 86_400_000).toISOString(), 10), [], 'discovery’s retries never pick one up');
  assert.deepEqual(store.discoveryCounts(97), { queued: 0, promoted: 0, dropped: 0, cursor: null });
  /* Discovery meeting a registration the backfill already queued leaves it as it is. */
  await runDiscovery(97, { deadlineAt: soon() }, {
    store,
    listAgents: (async () => ({ items: [{ ...registered('50', 9), created_at: new Date().toISOString() }], total: 1 })) as never,
    getAgent: (async () => null) as never,
    probeAgent: (async () => ({ answered: 0 })) as never,
  });
  assert.equal(store.backfillWaiting(97), 1);
  assert.equal(store.discoveryCounts(97).queued, 0);
});

test('the next page continues from the stored cursor, and the MCP pass follows the end of the A2A one', async () => {
  const calls: ListCall[] = [];
  const pages = [
    { items: [registered('5', 10)], total: 1, next_cursor: null, has_more: false },
    { items: [registered('6', 11)], total: 1, next_cursor: 'mcp-next', has_more: true },
  ];
  const deps = {
    store,
    listAgents: (async (options: ListCall) => {
      calls.push(options);
      return pages.shift();
    }) as never,
    getAgent: (async () => null) as never,
    probeAgent: (async () => ({ answered: 0 })) as never,
  };
  await runRegistryBackfill(97, { deadlineAt: soon() }, deps);
  assert.equal(calls[0].cursor, 'after-4');
  assert.equal(calls[0].hasA2a, true);
  assert.equal(store.backfillPasses(97).find((p) => p.pass === 'a2a')?.done, true, 'no further page: the pass is read');
  await runRegistryBackfill(97, { deadlineAt: soon() }, deps);
  assert.equal(calls[1].cursor, undefined, 'the MCP pass starts at its own beginning');
  assert.equal(calls[1].hasMcp, true);
  assert.equal(calls[1].hasA2a, undefined);
});

test('a lookup the indexer fails costs nothing, and a full queue reads no page', async () => {
  const chain = 56;
  const rows = Array.from({ length: BACKFILL_QUEUE_FLOOR }, (_, i) => ({ chainId: chain, tokenId: String(1000 + i), registeredAt: new Date(Date.UTC(2026, 2, 1, 0, i)).toISOString() }));
  store.enqueueBackfill(rows);
  let listed = false;
  const outcome = await runRegistryBackfill(chain, { deadlineAt: soon() }, {
    store,
    listAgents: (async () => {
      listed = true;
      return { items: [], total: 0 };
    }) as never,
    getAgent: (async () => null) as never,
    probeAgent: (async () => ({ answered: 0 })) as never,
  });
  assert.equal(listed, false, 'the queue is one page deep at most');
  assert.equal(outcome.tried, 0);
  assert.equal(store.backfillWaiting(chain), BACKFILL_QUEUE_FLOOR, 'still waiting: the failure was the indexer’s');
});

test('a host is sampled, then the rest of its registrations are recorded as sampled without a call', async () => {
  const chain = 56;
  let probes = 0;
  const deps = {
    store,
    listAgents: (async () => ({ items: [], total: 0, has_more: true, next_cursor: null })) as never,
    getAgent: (async (_chain: number, tokenId: string) => ({ token_id: tokenId, chain_id: chain, services: { a2a: { endpoint: `https://listings.example/a2a/agents/${tokenId}/card` } } })) as never,
    probeAgent: (async () => {
      probes += 1;
      return { answered: 0, probes: [{ ok: false, awaitingAgent: true }] };
    }) as never,
  };
  let runs = 0;
  while (probes < BACKFILL_HOST_SAMPLE && runs < 20) {
    const outcome = await runRegistryBackfill(chain, { deadlineAt: soon() }, deps);
    assert.ok(outcome.tried <= BACKFILL_TRIES, 'never more probes than a run allows');
    runs += 1;
  }
  assert.equal(probes, BACKFILL_HOST_SAMPLE, 'sampled in full');
  assert.deepEqual(store.backfillHostStats(chain).get('listings.example'), { tried: BACKFILL_HOST_SAMPLE, answered: 0 });
  const next = await runRegistryBackfill(chain, { deadlineAt: soon() }, deps);
  assert.equal(probes, BACKFILL_HOST_SAMPLE, 'no further call to that host');
  assert.ok(next.sampledOut > 0);
  assert.equal(next.tried, 0);
  assert.equal(store.backfillCounts(chain).sampledOut, next.sampledOut);
});

test('a run whose time is up reads nothing and tries nothing', async () => {
  let called = false;
  const outcome = await runRegistryBackfill(97, { deadlineAt: Date.now() - 1 }, {
    store,
    listAgents: (async () => {
      called = true;
      return { items: [], total: 0 };
    }) as never,
    getAgent: (async () => {
      called = true;
      return null;
    }) as never,
  });
  assert.equal(called, false);
  assert.equal(outcome.tried, 0);
  assert.ok(outcome.unreached > 0, 'what was due is counted as unreached');
});

test('a chain is complete once both passes are read and nothing waits', async () => {
  const chain = 97;
  const deps = {
    store,
    listAgents: (async () => ({ items: [], total: 0, next_cursor: null, has_more: false })) as never,
    getAgent: (async (_c: number, tokenId: string) => ({ token_id: tokenId, chain_id: chain, services: {} })) as never,
    probeAgent: (async () => ({ answered: 0 })) as never,
  };
  let outcome = await runRegistryBackfill(chain, { deadlineAt: soon() }, deps);
  for (let i = 0; i < 5 && !outcome.complete; i += 1) outcome = await runRegistryBackfill(chain, { deadlineAt: soon() }, deps);
  assert.equal(outcome.complete, true);
  assert.equal(store.backfillCounts(chain).passesDone, 2);
});
