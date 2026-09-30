import assert from 'node:assert/strict';
import test from 'node:test';

import { summariseEconomicHistory } from '../src/lib/erc8183/economic-history.js';
import type { HiredJob } from '../src/lib/erc8183/types.js';

function job(status: HiredJob['status'], budgetRaw = '100000000000000000'): HiredJob {
  return {
    id: crypto.randomUUID(), jobId: String(Math.random()), chainId: 97,
    isTestnet: true, agentChainId: 56, agentTokenId: '1', agentName: 'Agent',
    provider: '0x0000000000000000000000000000000000000001', task: 'task', budgetRaw,
    expiredAt: new Date().toISOString(), hiredAt: new Date().toISOString(),
    hireTxHash: '0x01', status, statusCheckedAt: new Date().toISOString(),
    deliverableUrl: null, settleTxHash: null,
  };
}

test('economic history separates outcomes without treating submissions as completions', () => {
  const history = summariseEconomicHistory([
    job('COMPLETED'), job('SUBMITTED'), job('FUNDED'), job('REJECTED'), job('EXPIRED'),
  ]);
  assert.deepEqual(
    { jobs: history.jobs, delivered: history.delivered, completed: history.completed, unresolved: history.unresolved, rejected: history.rejected, expired: history.expired, total: history.totalFundedU },
    { jobs: 5, delivered: 2, completed: 1, unresolved: 2, rejected: 1, expired: 1, total: '0.5' },
  );
});

test('open or unfunded records do not become economic activity', () => {
  const open = { ...job('OPEN'), hireTxHash: null };
  assert.equal(summariseEconomicHistory([open]).jobs, 0);
});

test('a chain-verified funded job is counted when a relay exposes no transaction hash', () => {
  const funded = { ...job('FUNDED'), hireTxHash: null };
  assert.equal(summariseEconomicHistory([funded]).jobs, 1);
});
