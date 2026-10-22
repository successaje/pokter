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

test('a lifecycle demonstration is neither a delivery nor a miss for the agent', () => {
  const demo = { ...job('COMPLETED'), jobId: 'demo' };
  const real = { ...job('COMPLETED'), jobId: 'real' };
  const history = summariseEconomicHistory([demo, real], Date.now(), { isLifecycleDemo: (j) => j.jobId === 'demo' });
  assert.equal(history.completed, 1);
  assert.equal(history.delivered, 1);
  assert.equal(history.jobs, 1);
  assert.equal(history.lifecycleDemos, 1);
});

test('a job the seller refused when funded is reported as refused, not missed', () => {
  // Sluicegate refused job 56995 because Pokter left its signed quote out;
  // counting that as a lapse would have marked it an agent that misses work.
  const past = new Date(Date.now() - 60_000).toISOString();
  const refusedLapsed = { ...job('FUNDED'), expiredAt: past };
  const refusedExpired = job('EXPIRED');
  const silent = { ...job('FUNDED'), expiredAt: past };
  const refusedIds = new Set([refusedLapsed.id, refusedExpired.id]);
  const history = summariseEconomicHistory([refusedLapsed, refusedExpired, silent, job('COMPLETED')], Date.now(), {
    refusedAtNotice: (j) => refusedIds.has(j.id),
  });
  assert.equal(history.refused, 2);
  assert.equal(history.missed, 1);
  assert.equal(history.pending, 0);
});

test('a refused job the seller delivered after all counts as delivered', () => {
  const delivered = job('SUBMITTED');
  const history = summariseEconomicHistory([delivered], Date.now(), { refusedAtNotice: () => true });
  assert.equal(history.refused, 0);
  assert.equal(history.delivered, 1);
});

/* The operator key that was the provider on job 97/1446. */
const POKTER = '0x93847647d7eb72a69E162117df6a8697dF53EDda';
const AGENT = '0x06F757064043e57dBbCCD6D95Ee1113D9796c715';
const owed = (status: HiredJob['status'], provider: string): HiredJob => ({ ...job(status), provider: provider as HiredJob['provider'] });

test('a job Pokter owed and missed is not the agent’s miss', () => {
  /*
   * Job 97/1446 was a testnet trial of Hevo Rebalance: Pokter funded it
   * and Pokter's own operator key was the provider, so the agent was never
   * named in it and could not have delivered. Pokter still reported
   * "missed 1 of 1 paid jobs… so it is not called reliable".
   */
  const history = summariseEconomicHistory([owed('EXPIRED', POKTER)]);
  assert.equal(history.missed, 0, 'the agent is not blamed for a delivery it never owed');
  assert.equal(history.operatorMissed, 1, 'and the miss is still counted, against Pokter');
});

test('the agent’s own missed job still counts against it', () => {
  // The fix must not launder real misses: only the provider decides.
  const history = summariseEconomicHistory([owed('EXPIRED', AGENT)]);
  assert.equal(history.missed, 1);
  assert.equal(history.operatorMissed, 0);
});

test('credit and blame are withheld by the same rule', () => {
  /*
   * `selfDelivered` already excluded Pokter-submitted deliveries, and
   * `missed` did not — so Pokter gave no credit for a trial it delivered
   * and assigned blame for one it failed to deliver. One provider test
   * now governs both.
   */
  const delivered = summariseEconomicHistory([owed('COMPLETED', POKTER)]);
  assert.equal(delivered.selfDelivered, 0, 'no credit for Pokter’s delivery');
  assert.equal(delivered.operatorDelivered, 1);

  const lapsed = summariseEconomicHistory([owed('EXPIRED', POKTER)]);
  assert.equal(lapsed.missed, 0, 'and no blame for Pokter’s miss');
  assert.equal(lapsed.operatorMissed, 1);
});

test('a mix is split by who owed each job, and nothing is dropped', () => {
  const history = summariseEconomicHistory([
    owed('EXPIRED', AGENT), owed('EXPIRED', AGENT),
    owed('EXPIRED', POKTER),
    owed('COMPLETED', AGENT),
  ]);
  assert.equal(history.missed, 2);
  assert.equal(history.operatorMissed, 1);
  assert.equal(history.missed + history.operatorMissed, history.expired, 'every expired job lands in exactly one of the two');
});

test('a courier delivery carrying the agent’s answer is counted apart from a bare operator one', () => {
  /*
   * Job 97/1585: Pokter Evidence answered over A2A and the courier
   * submitted the manifest. Both jobs below have a Pokter wallet as
   * provider, so the provider address alone cannot tell them apart — the
   * manifest can, and `relayedDelivered` is the half it identifies.
   */
  const carried = { ...owed('COMPLETED', POKTER), jobId: '1585' };
  const bare = { ...owed('COMPLETED', POKTER), jobId: '1586' };
  const history = summariseEconomicHistory([carried, bare], Date.now(), {
    isRelayedDelivery: (j) => j.jobId === '1585',
  });

  assert.equal(history.operatorDelivered, 2, 'both were submitted by a Pokter wallet');
  assert.equal(history.relayedDelivered, 1, 'one of them carried the agent’s own answer');
  assert.equal(history.selfDelivered, 0, 'and neither is the agent submitting for itself');
  assert.ok(history.relayedDelivered <= history.operatorDelivered, 'a refinement of the split, not a redrawing of it');
});

test('a relayed delivery the agent itself submitted is not possible, and is not counted as one', () => {
  // Only a Pokter wallet can relay; a predicate that said otherwise is ignored.
  const history = summariseEconomicHistory([owed('COMPLETED', AGENT)], Date.now(), {
    isRelayedDelivery: () => true,
  });
  assert.equal(history.selfDelivered, 1);
  assert.equal(history.relayedDelivered, 0);
});

test('without the manifest predicate nothing is assumed to be relayed', () => {
  const history = summariseEconomicHistory([owed('COMPLETED', POKTER)]);
  assert.equal(history.operatorDelivered, 1);
  assert.equal(history.relayedDelivered, 0, 'an unread manifest is not evidence of a carried answer');
});
