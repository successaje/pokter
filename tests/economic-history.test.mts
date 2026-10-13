import assert from 'node:assert/strict';
import test from 'node:test';

import { summariseEconomicHistory } from '../src/lib/erc8183/economic-history.js';
import type { HiredJob } from '../src/lib/erc8183/types.js';

function job(status: HiredJob['status'], budgetRaw = '100000000000000000', client?: HiredJob['client']): HiredJob {
  return {
    id: crypto.randomUUID(), jobId: String(Math.random()), chainId: 97,
    isTestnet: true, agentChainId: 56, agentTokenId: '1', agentName: 'Agent',
    provider: '0x0000000000000000000000000000000000000001', task: 'task', budgetRaw,
    expiredAt: new Date().toISOString(), hiredAt: new Date().toISOString(),
    hireTxHash: '0x01', status, statusCheckedAt: new Date().toISOString(),
    deliverableUrl: null, settleTxHash: null, client,
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

test('outside-team market proof excludes declared wallets and unknown legacy funders', () => {
  const outsideA = '0x0000000000000000000000000000000000000011';
  const outsideB = '0x0000000000000000000000000000000000000012';
  const team = '0x93847647d7eb72a69E162117df6a8697dF53EDda';
  const history = summariseEconomicHistory([
    job('COMPLETED', undefined, outsideA),
    job('COMPLETED', undefined, outsideA),
    job('EXPIRED', undefined, outsideB),
    job('COMPLETED', undefined, team),
    job('COMPLETED'),
  ]);
  assert.deepEqual(history.outsideTeam, {
    jobs: 3,
    completed: 2,
    terminal: 3,
    uniqueBuyers: 2,
    completionRate: 2 / 3,
  });
  assert.equal(history.uniqueBuyers, 3, 'all known buyers include the team wallet but never invent the unknown funder');
});
