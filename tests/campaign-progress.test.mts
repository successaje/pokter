import assert from 'node:assert/strict';
import test from 'node:test';

import type { HiredJob } from '../src/lib/erc8183/types';
import { summarizeCampaignHires } from '../src/lib/campaign/progress';

function job(overrides: Partial<HiredJob> = {}): HiredJob {
  return {
    id: '97:1', jobId: '1', chainId: 97, isTestnet: true,
    agentChainId: 56, agentTokenId: '10', agentName: 'Agent',
    provider: '0x0000000000000000000000000000000000000001', task: 'test',
    budgetRaw: '1', expiredAt: new Date(0).toISOString(),
    hiredAt: new Date(0).toISOString(), hireTxHash: null, status: 'FUNDED',
    statusCheckedAt: new Date(0).toISOString(), deliverableUrl: null,
    settleTxHash: null, ...overrides,
  };
}

test('campaign progress counts funded distinct identities, not open drafts', () => {
  const progress = summarizeCampaignHires([
    job(),
    job({ id: '97:2', jobId: '2', agentTokenId: '10', status: 'COMPLETED' }),
    job({ id: '97:3', jobId: '3', agentTokenId: '11', status: 'SUBMITTED' }),
    job({ id: '97:4', jobId: '4', agentTokenId: '12', status: 'OPEN' }),
  ]);
  assert.equal(progress.qualifyingJobs.length, 3);
  assert.equal(progress.distinctAgents, 2);
  assert.equal(progress.completedJobs, 1);
  assert.equal(progress.pokterMarketplaceVerified, true);
});

test('campaign progress rejects unknown identities and unrelated chains', () => {
  const progress = summarizeCampaignHires([
    job({ agentTokenId: 'unknown' }),
    job({ chainId: 1 }),
  ]);
  assert.equal(progress.qualifyingJobs.length, 0);
  assert.equal(progress.pokterMarketplaceVerified, false);
});
