import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeMarketplaceActivity } from '../src/lib/erc8183/activity-stats';
import type { HiredJob, JobStatusName } from '../src/lib/erc8183/types';

function job(id: string, status: JobStatusName, budgetRaw: string, checked: string): HiredJob {
  return {
    id, jobId: id, chainId: 97, isTestnet: true, agentChainId: 56,
    agentTokenId: '1', agentName: 'Agent', provider: '0x0000000000000000000000000000000000000001',
    task: 'private', budgetRaw, expiredAt: checked, hiredAt: checked,
    hireTxHash: null, status, statusCheckedAt: checked, deliverableUrl: null,
    settleTxHash: null, disputeTxHash: null,
  };
}

test('activity stats expose useful totals without retaining private job fields', () => {
  const result = summarizeMarketplaceActivity([
    job('1', 'FUNDED', '100', '2026-09-30T10:00:00.000Z'),
    job('2', 'SUBMITTED', '200', '2026-09-30T11:00:00.000Z'),
    job('3', 'COMPLETED', '300', '2026-09-30T12:00:00.000Z'),
  ]);
  assert.equal(result.indexedJobs, 3);
  assert.equal(result.activeJobs, 2);
  assert.equal(result.completedJobs, 1);
  assert.equal(result.indexedValueRaw, '600');
  assert.equal(result.completedValueRaw, '300');
  assert.equal(result.lastCheckedAt, '2026-09-30T12:00:00.000Z');
  assert.equal('task' in result, false);
});

test('empty activity is explicit rather than fabricated', () => {
  const result = summarizeMarketplaceActivity([]);
  assert.equal(result.indexedJobs, 0);
  assert.equal(result.indexedValueRaw, '0');
  assert.equal(result.lastCheckedAt, null);
  assert.deepEqual(Object.values(result.byStatus), [0, 0, 0, 0, 0, 0]);
});
