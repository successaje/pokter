import assert from 'node:assert/strict';
import test from 'node:test';

import { withoutClaimedIds } from '../src/lib/erc8183/claimed-ids';
import { oneRowPerJob } from '../src/lib/erc8183/job-dedupe';
import type { HiredJob } from '../src/lib/erc8183/types';

const job = (over: Partial<HiredJob> & { id: string; jobId: string }): HiredJob => ({
  chainId: 97,
  isTestnet: true,
  agentChainId: 97,
  agentTokenId: '2554',
  agentName: 'seeded',
  provider: '0x6D3BD48b653beEeeEf6BBFd2DfCCf32B28049Cc5',
  task: 'task',
  budgetRaw: '100000000000000000',
  expiredAt: '2026-10-17T23:12:20.000Z',
  hiredAt: '2026-10-16T22:57:23.370Z',
  hireTxHash: null,
  status: 'COMPLETED',
  statusCheckedAt: '2026-10-16T23:51:08.691Z',
  deliverableUrl: null,
  settleTxHash: null,
  ...over,
} as HiredJob);

const ids = (rows: readonly HiredJob[]) => oneRowPerJob(rows).map((r) => r.id);

test('a job written once is returned once', () => {
  // A bug here should drop nothing, not everything.
  const rows = [job({ id: 'uuid-a', jobId: '1' }), job({ id: '97:2', jobId: '2' })];
  assert.deepEqual(ids(rows), ['uuid-a', '97:2']);
});

test('one job written by both writers is returned once', () => {
  /*
   * The 13 rows this exists for: `hireAgent` recorded a UUID row at
   * funding, the chain indexer recorded "<chainId>:<jobId>" later. Neither
   * is a phantom — it is one job, counted twice.
   */
  const rows = [
    job({ id: 'uuid-hire', jobId: '1483' }),
    job({ id: '97:1483', jobId: '1483' }),
  ];
  assert.deepEqual(ids(rows), ['97:1483'], 'the chain indexer’s row is the one kept');
});

test('the later hire wins, the rule claimed-ids.ts reasons with', () => {
  /*
   * Two rules disagreeing about which row is real would be worse than
   * either. A hire predicts its id before sending, so the row that claimed
   * it first is the phantom and the real one recorded itself afterwards.
   */
  const rows = [
    job({ id: 'uuid-earlier', jobId: '1522', hiredAt: '2026-10-16T22:57:17.606Z' }),
    job({ id: 'uuid-later', jobId: '1522', hiredAt: '2026-10-16T22:57:23.370Z' }),
  ];
  assert.deepEqual(ids(rows), ['uuid-later']);
  assert.deepEqual(ids([...rows].reverse()), ['uuid-later'], 'input order does not decide it');
});

test('the same job id on two chains is two jobs', () => {
  const rows = [
    job({ id: 'a', jobId: '1522', chainId: 97 }),
    job({ id: 'b', jobId: '1522', chainId: 56, isTestnet: false }),
  ];
  assert.deepEqual(ids(rows).sort(), ['a', 'b']);
});

test('it composes with the phantom filter rather than fighting it', () => {
  /*
   * The real 1522: a hire for one agent claimed the id and created nothing,
   * then a hire for another created it. `withoutClaimedIds` drops the
   * phantom; this must then leave the survivor alone rather than pick
   * between two rows one of which was never a job.
   */
  const rows = [
    job({ id: 'uuid-phantom', jobId: '1522', agentTokenId: '2556', hiredAt: '2026-10-16T22:57:17.606Z' }),
    job({ id: 'uuid-real', jobId: '1522', agentTokenId: '2554', hiredAt: '2026-10-16T22:57:23.370Z' }),
  ];
  const filtered = withoutClaimedIds(rows);
  assert.deepEqual(filtered.map((r) => r.id), ['uuid-real'], 'the phantom goes first');
  assert.deepEqual(ids(filtered), ['uuid-real'], 'and nothing further is dropped');
});

test('three copies of one job still return one', () => {
  const rows = [
    job({ id: 'uuid-1', jobId: '7', hiredAt: '2026-10-16T10:00:00.000Z' }),
    job({ id: 'uuid-2', jobId: '7', hiredAt: '2026-10-16T11:00:00.000Z' }),
    job({ id: '97:7', jobId: '7', hiredAt: '2026-10-16T09:00:00.000Z' }),
  ];
  assert.deepEqual(ids(rows), ['uuid-2']);
});

test('order is preserved, so an upstream sort still holds', () => {
  const rows = [
    job({ id: 'c', jobId: '3' }),
    job({ id: 'a', jobId: '1' }),
    job({ id: 'b', jobId: '2' }),
  ];
  assert.deepEqual(ids(rows), ['c', 'a', 'b']);
});
