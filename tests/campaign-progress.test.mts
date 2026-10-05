import assert from 'node:assert/strict';
import test from 'node:test';

import type { HiredJob } from '../src/lib/erc8183/types';
import { summarizeCampaignHires, campaignVisiblePercent } from '../src/lib/campaign/progress';

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

/*
 * The visible-progress bar reports how much of what Pokter can see is done.
 * It used to divide by five, one per official task, while only two and a
 * half of those five produce any signal — so a wallet that had done
 * everything observable saw 50% and a half-empty bar, with the shortfall
 * reading as theirs rather than as the limit of what Pokter can verify.
 */
test('the visible-progress ceiling is reachable', () => {
  const ceiling = 1 + 1 + 0.5;
  const percent = (registered: boolean, agents: number, verified: boolean) =>
    Math.round(
      (Math.min(
        Number(registered) + Math.min(agents, 3) / 3 + (verified ? 0.5 : 0),
        ceiling,
      ) /
        ceiling) *
        100,
    );

  assert.equal(percent(false, 0, false), 0);
  assert.equal(percent(true, 3, true), 100, 'everything observable means full');
  assert.equal(percent(true, 0, false), 40);
  // More hires than the task asks for must not overflow the bar.
  assert.equal(percent(true, 9, true), 100);
});

/*
 * The percentage the passport and the account page both report.
 *
 * It lives in one function now because two surfaces showing the same wallet
 * a different number is the failure this guards against.
 */
test('campaign progress is measured against what Pokter can verify', () => {
  assert.equal(
    campaignVisiblePercent({ registered: false, distinctAgents: 0, pokterMarketplaceVerified: false }),
    0,
  );
  // Registering alone is 1 of the 2.5 Pokter can see.
  assert.equal(
    campaignVisiblePercent({ registered: true, distinctAgents: 0, pokterMarketplaceVerified: false }),
    40,
  );
  // Everything visible done reads as full, not as 50% of five.
  assert.equal(
    campaignVisiblePercent({ registered: true, distinctAgents: 3, pokterMarketplaceVerified: true }),
    100,
  );
  // Hiring more than three does not push it past full.
  assert.equal(
    campaignVisiblePercent({ registered: true, distinctAgents: 9, pokterMarketplaceVerified: true }),
    100,
  );
  // Partial hires count proportionally.
  assert.equal(
    campaignVisiblePercent({ registered: false, distinctAgents: 3, pokterMarketplaceVerified: false }),
    40,
  );
});
