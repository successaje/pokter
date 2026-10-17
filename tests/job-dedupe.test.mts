import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { DUPLICATE_LOSERS_SQL, JOB_CONFLICTS_DDL, JOB_IDENTITY_INDEX } from '../src/lib/erc8183/job-dedupe';

/* Only the columns the rule reads; the real table has twenty-one. */
const TABLE = `
  CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    chain_id INTEGER NOT NULL,
    agent_token_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    hired_at TEXT NOT NULL,
    status_checked_at TEXT NOT NULL
  );
`;

function db(rows: Array<Record<string, string | number>>): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec(TABLE);
  database.exec(JOB_CONFLICTS_DDL);
  for (const row of rows) {
    database
      .prepare('INSERT INTO jobs (id,job_id,chain_id,agent_token_id,provider,hired_at,status_checked_at) VALUES (?,?,?,?,?,?,?)')
      .run(row.id, row.job_id, row.chain_id, row.agent_token_id, row.provider, row.hired_at, row.status_checked_at);
  }
  return database;
}

const losers = (database: DatabaseSync) =>
  (database.prepare(DUPLICATE_LOSERS_SQL).all() as { id: string }[]).map((r) => r.id);

test('a job recorded once is never set aside', () => {
  // A bug here should quarantine nothing, not everything.
  const d = db([
    { id: 'uuid-a', job_id: '1', chain_id: 97, agent_token_id: '10', provider: '0xa', hired_at: 'T1', status_checked_at: 'T1' },
    { id: '97:2', job_id: '2', chain_id: 97, agent_token_id: '11', provider: '0xb', hired_at: 'T1', status_checked_at: 'T1' },
  ]);
  assert.deepEqual(losers(d), []);
});

test('the later hire wins, which is the rule claimed-ids.ts reasons with', () => {
  /*
   * The shape that actually happened: a fixture hire for Venus Rate Router
   * created nothing but recorded itself as job 1522, and the next hire, for
   * Venus Yield Keeper, created 1522 for real. A hire predicts its id before
   * sending, so the row that claimed the id before anything existed there is
   * the phantom; the real one recorded itself afterwards.
   *
   * The two mechanisms must not disagree about which row is real, or this
   * would set aside the row `withoutClaimedIds` keeps.
   */
  const d = db([
    { id: 'uuid-phantom', job_id: '1522', chain_id: 97, agent_token_id: '2556', provider: '0xa4', hired_at: '22:57:17', status_checked_at: '23:59' },
    { id: 'uuid-real', job_id: '1522', chain_id: 97, agent_token_id: '2554', provider: '0x6d', hired_at: '22:57:23', status_checked_at: '23:51' },
  ]);
  assert.deepEqual(losers(d), ['uuid-phantom'], 'the earlier hire loses even though it was chain-checked more recently');
});

test('the chain indexer\u2019s row breaks a tie between equal hires', () => {
  // Only the indexer mints "<chainId>:<jobId>", by reading the escrow.
  const d = db([
    { id: 'uuid-hire', job_id: '9', chain_id: 97, agent_token_id: '1', provider: '0xa', hired_at: 'T1', status_checked_at: 'T9' },
    { id: '97:9', job_id: '9', chain_id: 97, agent_token_id: '1', provider: '0xa', hired_at: 'T1', status_checked_at: 'T1' },
  ]);
  assert.deepEqual(losers(d), ['uuid-hire']);
});

test('the same job id on two chains is two jobs, not a duplicate', () => {
  // 97/1522 and 56/1522 are unrelated, and the partition has to say so.
  const d = db([
    { id: 'a', job_id: '1522', chain_id: 97, agent_token_id: '1', provider: '0xa', hired_at: 'T1', status_checked_at: 'T1' },
    { id: 'b', job_id: '1522', chain_id: 56, agent_token_id: '2', provider: '0xb', hired_at: 'T1', status_checked_at: 'T1' },
  ]);
  assert.deepEqual(losers(d), []);
});

test('three rows for one job leave exactly one standing', () => {
  const d = db([
    { id: 'uuid-1', job_id: '7', chain_id: 97, agent_token_id: '1', provider: '0xa', hired_at: 'T1', status_checked_at: 'T1' },
    { id: 'uuid-2', job_id: '7', chain_id: 97, agent_token_id: '2', provider: '0xb', hired_at: 'T2', status_checked_at: 'T2' },
    { id: '97:7', job_id: '7', chain_id: 97, agent_token_id: '3', provider: '0xc', hired_at: 'T0', status_checked_at: 'T0' },
  ]);
  assert.deepEqual(losers(d).sort(), ['97:7', 'uuid-1'], 'the latest hire survives, chain-form id or not');
});

test('the rule is deterministic when everything else ties', () => {
  // Two runs of the migration must not disagree about which row to keep.
  const rows = [
    { id: 'bbb', job_id: '9', chain_id: 97, agent_token_id: '1', provider: '0xa', hired_at: 'T1', status_checked_at: 'T1' },
    { id: 'aaa', job_id: '9', chain_id: 97, agent_token_id: '2', provider: '0xb', hired_at: 'T1', status_checked_at: 'T1' },
  ];
  assert.deepEqual(losers(db(rows)), ['bbb']);
  assert.deepEqual(losers(db([...rows].reverse())), ['bbb'], 'insertion order does not change the answer');
});

test('once deduped, the unique index refuses a second row for the same job', () => {
  /*
   * The actual fix. `record` does INSERT OR REPLACE, and SQLite drops rows
   * violating any unique constraint — so a later write replaces the earlier
   * one instead of sitting beside it.
   */
  const d = db([{ id: '97:1522', job_id: '1522', chain_id: 97, agent_token_id: '2554', provider: '0xright', hired_at: 'T1', status_checked_at: 'T1' }]);
  d.exec(JOB_IDENTITY_INDEX);

  assert.throws(
    () => d.prepare('INSERT INTO jobs (id,job_id,chain_id,agent_token_id,provider,hired_at,status_checked_at) VALUES (?,?,?,?,?,?,?)')
      .run('uuid-other', '1522', 97, '2556', '0xwrong', 'T2', 'T2'),
    /UNIQUE/i,
    'a plain insert of a second row for the same job is refused',
  );

  d.prepare('INSERT OR REPLACE INTO jobs (id,job_id,chain_id,agent_token_id,provider,hired_at,status_checked_at) VALUES (?,?,?,?,?,?,?)')
    .run('uuid-other', '1522', 97, '2556', '0xlater', 'T2', 'T2');
  const left = d.prepare('SELECT id, provider FROM jobs WHERE chain_id=97 AND job_id=?').all('1522') as { id: string; provider: string }[];
  assert.equal(left.length, 1, 'still one row');
  assert.equal(left[0].provider, '0xlater', 'and it is the later write');
});
