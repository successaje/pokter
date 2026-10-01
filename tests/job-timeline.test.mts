import assert from 'node:assert/strict';
import test from 'node:test';

import { jobTimeline } from '../src/lib/jobs/timeline';
import type { HiredJob, JobStatusName } from '../src/lib/erc8183/types';

function job(status: JobStatusName): HiredJob {
  return {
    id: 'local-1', jobId: '1', chainId: 97, isTestnet: true,
    agentTokenId: '42', agentName: 'Agent', provider: '0x0000000000000000000000000000000000000001',
    task: 'Test', budgetRaw: '1000000000000000000', hiredAt: '2026-10-01T00:00:00.000Z',
    expiredAt: '2026-10-02T00:00:00.000Z', hireTxHash: `0x${'1'.repeat(64)}`,
    status, statusCheckedAt: '2026-10-01T00:00:00.000Z', deliverableUrl: null, settleTxHash: null,
  };
}

test('a funded job shows delivery as pending without inventing an event', () => {
  const timeline = jobTimeline(job('FUNDED'));
  assert.equal(timeline.find((step) => step.id === 'funded')?.state, 'current');
  assert.equal(timeline.find((step) => step.id === 'delivered')?.source, 'pending');
});

test('expiry is terminal and never presented as settlement', () => {
  const timeline = jobTimeline(job('EXPIRED'));
  assert.equal(timeline.at(-1)?.id, 'terminal');
  assert.equal(timeline.at(-1)?.label, 'Expired');
  assert.equal(timeline.some((step) => step.id === 'settled'), false);
});

test('completion reports chain state without fabricating a settlement hash', () => {
  const timeline = jobTimeline(job('COMPLETED'));
  const settled = timeline.find((step) => step.id === 'settled');
  assert.equal(settled?.state, 'complete');
  assert.equal(settled?.transactionHash, null);
  assert.match(settled?.detail ?? '', /contract reports/i);
});

