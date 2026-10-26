import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { backfillJobCurrencies } from '../../src/lib/erc8183/currency-backfill';
import type { HiredJob } from '../../src/lib/erc8183/types';

/*
 * A job's token, as the store keeps it. Run under the server conditions
 * because the store is `server-only`.
 */

const USDT97 = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
const U97 = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';

function job(over: Partial<HiredJob> = {}): HiredJob {
  return {
    id: '97:1',
    jobId: '1',
    chainId: 97,
    isTestnet: true,
    agentTokenId: '2599',
    agentName: 'Pokter Evidence',
    provider: '0x93847647d7eb72a69E162117df6a8697dF53EDda',
    task: 'brief',
    budgetRaw: '100000000000000000',
    expiredAt: '2026-11-01T00:00:00.000Z',
    hiredAt: '2026-10-26T00:00:00.000Z',
    hireTxHash: null,
    status: 'FUNDED',
    statusCheckedAt: '2026-10-26T00:00:00.000Z',
    deliverableUrl: null,
    settleTxHash: null,
    ...over,
  };
}

test('a live database from before the column gains it, keeps its rows, and reads them as unknown', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pokter-usdt-legacy-'));
  const path = join(dir, 'jobs.db');
  /* The table as production has it today: no payment_token. */
  const legacy = new DatabaseSync(path);
  legacy.exec(`CREATE TABLE jobs (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, chain_id INTEGER NOT NULL, is_testnet INTEGER NOT NULL, agent_chain_id INTEGER, agent_token_id TEXT NOT NULL, agent_name TEXT NOT NULL, provider_label TEXT, provider TEXT NOT NULL, task TEXT NOT NULL, budget_raw TEXT NOT NULL, expired_at TEXT NOT NULL, hired_at TEXT NOT NULL, hire_tx_hash TEXT, status TEXT NOT NULL, status_checked_at TEXT NOT NULL, deliverable_url TEXT, settle_tx_hash TEXT, dispute_tx_hash TEXT, reclaim_tx_hash TEXT, client TEXT)`);
  legacy.prepare(`INSERT INTO jobs (id, job_id, chain_id, is_testnet, agent_token_id, agent_name, provider, task, budget_raw, expired_at, hired_at, status, status_checked_at) VALUES ('97:1662', '1662', 97, 1, '2618', 'Brinkwatch', '0xB72335e083A7eed9731D24C48dbf07c4Ef1f051a', 't', '100000000000000000', 'x', '2026-10-25T16:39:13.855Z', 'SUBMITTED', 'x')`).run();
  legacy.close();

  const { openJobStore } = await import('../../src/lib/erc8183/store');
  const store = openJobStore(path);
  const [row] = store.all();
  assert.equal(row.jobId, '1662', 'the row survived');
  assert.equal(row.paymentToken, null, 'unknown, not $U');
  assert.equal(store.withoutPaymentToken().length, 1);
});

test('a token is written once, a record that does not know it keeps it, and the backfill fills only the unknown', async () => {
  const { openJobStore } = await import('../../src/lib/erc8183/store');
  const dir = mkdtempSync(join(tmpdir(), 'pokter-usdt-store-'));
  const store = openJobStore(join(dir, 'jobs.db'));

  store.record(job({ id: '97:1', jobId: '1', paymentToken: USDT97 }));
  /* A sweep repairing status without reading the token must not erase it. */
  store.record(job({ id: '97:1', jobId: '1', status: 'SUBMITTED', paymentToken: null }));
  assert.equal(store.byId('97:1')?.paymentToken, USDT97);
  assert.equal(store.byId('97:1')?.status, 'SUBMITTED');

  store.record(job({ id: '97:2', jobId: '2' }));
  store.record(job({ id: '97:3', jobId: '3' }));
  assert.deepEqual(store.withoutPaymentToken().map((j) => j.jobId).sort(), ['2', '3']);

  /* `setPaymentToken` never overwrites a token already known. */
  assert.equal(store.setPaymentToken(97, '1', U97), 0);
  assert.equal(store.byId('97:1')?.paymentToken, USDT97);

  const report = await backfillJobCurrencies({
    rows: store.withoutPaymentToken().map((j) => ({ chainId: j.chainId, jobId: j.jobId })),
    read: async (_chainId, jobId) => (jobId === '2' ? U97 : null),
    write: true,
    set: (chainId, jobId, token) => store.setPaymentToken(chainId, jobId, token),
  });
  assert.equal(report.written, 1);
  assert.equal(store.byId('97:2')?.paymentToken, U97);
  assert.equal(store.byId('97:3')?.paymentToken, null, 'a failed read stays unknown');
  assert.deepEqual(store.withoutPaymentToken().map((j) => j.jobId), ['3'], 'and is still listed for the next run');
});
