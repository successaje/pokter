import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/*
 * The publication choice on a real store. The route that writes it reads
 * the escrow through the SDK, which these tests cannot load, so its checks
 * are asserted from source in tests/answer-publication.test.mts.
 */
const dir = mkdtempSync(join(tmpdir(), 'pokter-publication-'));
process.env.JOB_DB_PATH = join(dir, 'jobs.db');
process.env.RATE_LIMIT_DB_PATH = join(dir, 'rate-limit.db');

const { getJobStore } = (await import('../../src/lib/erc8183/store')) as typeof import('../../src/lib/erc8183/store');

const CLIENT = '0xdAb12cf15F4385188bE62bda9F00877AF4C1b32f';

test('the newest decision wins, and an older one replayed changes nothing', () => {
  const store = getJobStore();
  assert.equal(store.answerPublication(97, '1543'), null, 'no decision is not a decision to publish');
  assert.equal(store.recordAnswerPublication({ chainId: 97, jobId: '1543', client: CLIENT, published: true, decidedAt: '2026-10-27T12:00:00.000Z', signature: '0x01' }), 'recorded');
  assert.equal(store.recordAnswerPublication({ chainId: 97, jobId: '1543', client: CLIENT, published: false, decidedAt: '2026-10-27T12:05:00.000Z', signature: '0x02' }), 'recorded');
  assert.equal(store.recordAnswerPublication({ chainId: 97, jobId: '1543', client: CLIENT, published: true, decidedAt: '2026-10-27T12:00:00.000Z', signature: '0x01' }), 'stale', 'the earlier "publish", replayed');
  assert.deepEqual(store.answerPublication(97, '1543'), { published: false, decidedAt: '2026-10-27T12:05:00.000Z', client: CLIENT.toLowerCase() });
  assert.equal(store.answerPublication(56, '1543'), null, 'kept per chain');
});
