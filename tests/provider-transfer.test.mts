import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { attachDeliverySubmission, ensureProviderWork, releaseStagedDelivery, stageDelivery, stagedDeliveryForJob } from '../src/lib/assistant/provider-store';

const at = '2026-10-24T12:00:00Z';
const write = (key: string, owner: string) => ({ key, owner, chainId: 56, jobId: '57071', content: `draft by ${owner}`, contentSha256: 'x', at });

test('after a transfer, the new owner can stage once the old owner’s unsubmitted draft is released', () => {
  const db = new DatabaseSync(':memory:');
  ensureProviderWork(db);
  assert.equal(stageDelivery(db, write('old', '0xaa')), 'recorded');
  assert.equal(stageDelivery(db, write('new', '0xbb')), 'conflict', 'one job, one slot');
  assert.equal(releaseStagedDelivery(db, 'old'), true);
  assert.equal(stageDelivery(db, write('new', '0xbb')), 'recorded');
  assert.equal(stagedDeliveryForJob(db, 56, '57071')?.owner, '0xbb');
  assert.equal(releaseStagedDelivery(db, 'old'), false, 'releasing twice is harmless');
});

test('a submitted delivery is never released: its bytes are what the chain committed to', () => {
  const db = new DatabaseSync(':memory:');
  ensureProviderWork(db);
  stageDelivery(db, write('old', '0xaa'));
  assert.equal(attachDeliverySubmission(db, 'old', '0x' + '1'.repeat(64)), 'attached');
  assert.equal(releaseStagedDelivery(db, 'old'), false);
  assert.equal(stagedDeliveryForJob(db, 56, '57071')?.key, 'old');
});
