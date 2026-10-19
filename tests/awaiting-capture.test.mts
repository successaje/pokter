import assert from 'node:assert/strict';
import test from 'node:test';

import { awaitingCapture, awaitingRow, gradedAsUndeliveredSinceDelivered, gradedAsUnreadableSinceStored } from '../src/lib/assay/awaiting-capture';

test('a delivered job with nothing stored waits for capture instead of failing', () => {
  assert.equal(awaitingCapture({ status: 'COMPLETED' }, null), true);
  assert.equal(awaitingCapture({ status: 'SUBMITTED' }, undefined), true);
});

test('a stored deliverable, or a job not yet delivered, is graded as before', () => {
  assert.equal(awaitingCapture({ status: 'COMPLETED' }, { manifestText: '{}' }), false);
  assert.equal(awaitingCapture({ status: 'FUNDED' }, null), false);
  assert.equal(awaitingCapture({ status: 'EXPIRED' }, null), false);
});

test('the waiting row is pending, never undelivered, and names the job state', () => {
  const row = awaitingRow('delivery (job 1521)', { jobId: '1521', status: 'COMPLETED' });
  assert.equal(row.outcome, 'pending');
  assert.equal(row.pass, false);
  assert.match(row.reason ?? '', /COMPLETED on chain/);
  assert.doesNotMatch(row.reason ?? '', /undelivered|no deliverable/i);
});

test('a run that called a since-delivered job undelivered is graded again', () => {
  const rows = [{ jobId: '1508', outcome: 'undelivered' }, { jobId: '1509', outcome: 'correct' }];
  assert.equal(gradedAsUndeliveredSinceDelivered(rows, [{ jobId: '1508', status: 'COMPLETED' }]), true);
  assert.equal(gradedAsUndeliveredSinceDelivered(rows, [{ jobId: '1508', status: 'EXPIRED' }]), false, 'still undelivered: the result stands');
  assert.equal(gradedAsUndeliveredSinceDelivered([{ jobId: '1508', outcome: 'wrong' }], [{ jobId: '1508', status: 'COMPLETED' }]), false);
});

test('a delivery that does not match its on-chain hash is graded as unverifiable, never as undelivered', async () => {
  const { mismatchRow } = await import('../src/lib/assay/awaiting-capture');
  const row = mismatchRow('cake-wide-range', { jobId: '1511' }, { servedHash: '0x1f23b7538aa4c99d8a92', chainHash: '0x9628c7a07faf3b526234' });
  assert.equal(row.outcome, 'unreadable');
  assert.equal(row.pass, false);
  assert.match(row.reason ?? '', /does not match the hash the job committed on chain/);
  assert.doesNotMatch(row.reason ?? '', /undelivered|no deliverable/i);
});

test('a run that called a since-stored delivery unreadable is graded again', () => {
  const served = { served: '0x1f23b7538aa4c99d8a92' };
  const rows = [{ jobId: '1511', outcome: 'unreadable', observed: served }, { jobId: '1512', outcome: 'unreadable', observed: served }];
  assert.equal(gradedAsUnreadableSinceStored(rows, (jobId) => jobId === '1512'), true);
  assert.equal(gradedAsUnreadableSinceStored(rows, () => false), false, 'still not stored: the result stands');
  assert.equal(gradedAsUnreadableSinceStored([{ jobId: '1511', outcome: 'wrong', observed: null }], () => true), false);
});

test('a stored file graded unreadable for having no answer is final, not regraded every sweep', () => {
  assert.equal(gradedAsUnreadableSinceStored([{ jobId: '1511', outcome: 'unreadable', observed: null }], () => true), false);
});
