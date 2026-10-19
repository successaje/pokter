import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { readLastProbedAt, readProbeTotals } from '../src/lib/history/stats-query';

function seeded(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(
    `CREATE TABLE probes (
       id       INTEGER PRIMARY KEY AUTOINCREMENT,
       chain_id INTEGER NOT NULL,
       token_id TEXT    NOT NULL,
       ok       INTEGER NOT NULL
     )`,
  );
  db.exec('CREATE TABLE probe_corrections (probe_id INTEGER PRIMARY KEY, rule TEXT NOT NULL, reason TEXT NOT NULL, corrected_at TEXT NOT NULL)');
  db.exec(
    `INSERT INTO probes (chain_id, token_id, ok) VALUES
       (56, '100', 1), (56, '100', 0), (56, '200', 1),
       (97, '300', 0), (97, '400', 1)`,
  );
  return db;
}

/*
 * This query took the homepage down and passed typecheck, lint and the
 * build on the way: it was written with SQLite's `?1`, which node:sqlite
 * rejects with "column index out of range" whatever is bound to it. Only
 * running the SQL finds that, so it is run here.
 */
test('unscoped totals count every chain', () => {
  const totals = readProbeTotals(seeded());
  assert.equal(totals.taken, 5);
  assert.equal(totals.answered, 3);
  assert.equal(totals.agents, 4);
  assert.equal(totals.answering, 3);
});

test('a scope narrows to one chain', () => {
  const db = seeded();
  const mainnet = readProbeTotals(db, 56);
  assert.equal(mainnet.taken, 3);
  assert.equal(mainnet.answered, 2);
  assert.equal(mainnet.agents, 2);

  const testnet = readProbeTotals(db, 97);
  assert.equal(testnet.taken, 2);
  assert.equal(testnet.answered, 1);
  assert.equal(testnet.agents, 2);
});

test('the two scopes add up to the unscoped total', () => {
  const db = seeded();
  const all = readProbeTotals(db);
  const parts = [56, 97].map((chainId) => readProbeTotals(db, chainId));
  assert.equal(parts[0].taken + parts[1].taken, all.taken);
  assert.equal(parts[0].answered + parts[1].answered, all.answered);
});

/* An agent that answered once and failed once is answering, counted once. */
test('an agent is counted once however many times it was probed', () => {
  const totals = readProbeTotals(seeded(), 56);
  assert.equal(totals.agents, 2);
  assert.equal(totals.answering, 2);
});

test('a chain nobody has probed reports zeroes rather than throwing', () => {
  const totals = readProbeTotals(seeded(), 1);
  assert.equal(totals.taken, 0);
  assert.equal(totals.answered, 0);
  assert.equal(totals.agents, 0);
});

test('an empty table reports zeroes', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE probes (id INTEGER PRIMARY KEY, chain_id INTEGER NOT NULL, token_id TEXT NOT NULL, ok INTEGER NOT NULL)',
  );
  db.exec('CREATE TABLE probe_corrections (probe_id INTEGER PRIMARY KEY, rule TEXT NOT NULL, reason TEXT NOT NULL, corrected_at TEXT NOT NULL)');
  const totals = readProbeTotals(db);
  assert.equal(totals.taken, 0);
  assert.equal(totals.answered, 0);
});

test('a row marked as Pokter’s measurement error is not counted', () => {
  const db = seeded();
  // Row 2 is (56, '100', 0): the failure is Pokter's, not the agent's.
  db.exec("INSERT INTO probe_corrections (probe_id, rule, reason, corrected_at) VALUES (2, 'test', 'test', '2026-10-15')");
  const totals = readProbeTotals(db, 56);
  assert.equal(totals.taken, 2);
  assert.equal(totals.answered, 2);
});

test('the sweep queue reads the newest probe per agent, scoped to its chain', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    `CREATE TABLE probes (
       id        INTEGER PRIMARY KEY AUTOINCREMENT,
       chain_id  INTEGER NOT NULL,
       token_id  TEXT    NOT NULL,
       ok        INTEGER NOT NULL,
       probed_at TEXT    NOT NULL
     )`,
  );
  db.exec(
    `INSERT INTO probes (chain_id, token_id, ok, probed_at) VALUES
       (56, '100', 1, '2026-10-18T09:00:00Z'),
       (56, '100', 0, '2026-10-19T11:00:00Z'),
       (56, '200', 1, '2026-10-17T08:00:00Z'),
       (97, '100', 1, '2026-10-01T00:00:00Z')`,
  );

  const mainnet = readLastProbedAt(db, 56);
  assert.deepEqual(
    [...mainnet.entries()].sort(),
    [['100', '2026-10-19T11:00:00Z'], ['200', '2026-10-17T08:00:00Z']],
    'the newest reading per agent, answered or not',
  );
  // Token 100 exists on both chains with very different recency. Reading
  // across chains would put the testnet agent at the front of the mainnet
  // queue and keep it there, measuring the wrong roster.
  assert.deepEqual([...readLastProbedAt(db, 97).entries()], [['100', '2026-10-01T00:00:00Z']]);
  assert.equal(readLastProbedAt(db, 1).size, 0, 'a chain with no probes yields an empty queue');
});
