import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

/*
 * The deployed store has a discovery queue from before the backfill: no
 * `source`, no `host`. Opening it must keep every existing row counted as
 * a new registration, and keep discovery's own retries working on them.
 */
const dir = mkdtempSync(join(tmpdir(), 'pokter-queue-migration-'));
const path = join(dir, 'probes.db');
const old = new DatabaseSync(path);
old.exec(`
  CREATE TABLE discovery_queue (
    chain_id        INTEGER NOT NULL,
    token_id        TEXT    NOT NULL,
    registered_at   TEXT,
    first_seen      TEXT    NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT    NOT NULL,
    last_attempt_at TEXT,
    last_outcome    TEXT,
    state           TEXT    NOT NULL,
    PRIMARY KEY (chain_id, token_id)
  );
`);
const due = '2026-11-01T00:00:00.000Z';
old.prepare(`INSERT INTO discovery_queue (chain_id, token_id, registered_at, first_seen, attempts, next_attempt_at, state, last_outcome) VALUES (56, '395512', ?, ?, 1, ?, 'queued', 'no-agent-yet')`).run(due, due, due);
old.prepare(`INSERT INTO discovery_queue (chain_id, token_id, registered_at, first_seen, attempts, next_attempt_at, state, last_outcome) VALUES (56, '395600', ?, ?, 1, ?, 'promoted', 'answered')`).run(due, due, due);
old.close();
process.env.PROBE_DB_PATH = path;

const { getProbeStore } = (await import('../../src/lib/history/store')) as typeof import('../../src/lib/history/store');

test('existing queue rows stay new registrations after the columns are added', () => {
  const store = getProbeStore();
  assert.deepEqual(store.dueDiscoveries(56, '2026-11-25T00:00:00.000Z', 10), [{ chainId: 56, tokenId: '395512', attempts: 1 }], 'still due its weekly retry');
  assert.deepEqual(store.discoveryCounts(56), { queued: 1, promoted: 1, dropped: 0, cursor: null });
  assert.deepEqual(store.discoveredAgents(), [{ chainId: 56, tokenId: '395600' }]);
  assert.equal(store.backfillWaiting(56), 0);
  assert.deepEqual(store.backfillCounts(56), { queued: 0, promoted: 0, dropped: 0, sampledOut: 0, pages: 0, passesDone: 0, started: false });
  assert.equal(store.enqueueBackfill([{ chainId: 56, tokenId: '395512', registeredAt: due }]), 0, 'a registration discovery holds is not taken by the backfill');
});
