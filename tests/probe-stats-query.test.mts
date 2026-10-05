import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { readProbeTotals } from '../src/lib/history/stats-query';

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
    'CREATE TABLE probes (chain_id INTEGER NOT NULL, token_id TEXT NOT NULL, ok INTEGER NOT NULL)',
  );
  const totals = readProbeTotals(db);
  assert.equal(totals.taken, 0);
  assert.equal(totals.answered, 0);
});
