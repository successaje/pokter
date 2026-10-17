import assert from 'node:assert/strict';
import test from 'node:test';

import { awaitingCapture, awaitingRow } from '../src/lib/assay/awaiting-capture';

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
