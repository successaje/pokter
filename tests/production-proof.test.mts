import assert from 'node:assert/strict';
import test from 'node:test';

import { filterProductionJobs, summarizeProductionProof } from '../src/lib/erc8183/production-proof';
import type { HiredJob, JobStatusName } from '../src/lib/erc8183/types';

const TEAM = '0x0000000000000000000000000000000000000001' as const;
const BUYER_A = '0x0000000000000000000000000000000000000002' as const;
const BUYER_B = '0x0000000000000000000000000000000000000003' as const;

function job(id: string, status: JobStatusName, options: Partial<HiredJob> = {}): HiredJob {
  return {
    id,
    jobId: id,
    chainId: 56,
    isTestnet: false,
    agentChainId: 56,
    agentTokenId: id === '4' ? '2' : '1',
    agentName: 'Agent',
    provider: '0x0000000000000000000000000000000000000004',
    client: BUYER_A,
    task: 'private',
    budgetRaw: '100',
    expiredAt: '2026-10-14T00:00:00.000Z',
    hiredAt: '2026-10-10T00:00:00.000Z',
    hireTxHash: null,
    status,
    statusCheckedAt: '2026-10-11T00:00:00.000Z',
    deliverableUrl: null,
    settleTxHash: null,
    ...options,
  };
}

const isTeam = (candidate: HiredJob) => !candidate.client || candidate.client.toLowerCase() === TEAM.toLowerCase();

test('production proof keeps team, outside-team, and unknown funding honest', () => {
  const result = summarizeProductionProof([
    job('1', 'COMPLETED'),
    job('2', 'COMPLETED', { client: TEAM, budgetRaw: '200' }),
    job('3', 'EXPIRED', { client: BUYER_B }),
    job('4', 'REJECTED', { client: undefined }),
  ], isTeam);

  assert.equal(result.jobs, 4);
  assert.equal(result.outsideTeamJobs, 2);
  assert.equal(result.teamJobs, 2);
  assert.equal(result.unknownFunderJobs, 1);
  assert.equal(result.uniqueKnownBuyers, 3);
  assert.equal(result.agentsHired, 2);
  assert.equal(result.completedValueRaw, '300');
  assert.equal(result.completionRate, 0.5);
});

test('completion rate uses terminal outcomes, not active work', () => {
  const result = summarizeProductionProof([
    job('1', 'COMPLETED'),
    job('2', 'FUNDED'),
    job('3', 'SUBMITTED'),
  ], isTeam);
  assert.equal(result.terminal, 1);
  assert.equal(result.active, 2);
  assert.equal(result.completionRate, 1);
});

test('filters apply network, funder provenance, and time window together', () => {
  const jobs = [
    job('1', 'COMPLETED'),
    job('2', 'COMPLETED', { client: TEAM }),
    job('3', 'COMPLETED', { chainId: 97, isTestnet: true }),
    job('4', 'COMPLETED', { hiredAt: '2026-08-01T00:00:00.000Z' }),
  ];
  const selected = filterProductionJobs(
    jobs,
    { network: 'mainnet', funder: 'outside-team', window: '30d' },
    isTeam,
    Date.parse('2026-10-13T00:00:00.000Z'),
  );
  assert.deepEqual(selected.map((candidate) => candidate.id), ['1']);
});

test('a missing funder can never enter the outside-team population', () => {
  const selected = filterProductionJobs(
    [job('1', 'COMPLETED', { client: undefined })],
    { network: 'all', funder: 'outside-team', window: 'all' },
    isTeam,
    Date.parse('2026-10-13T00:00:00.000Z'),
  );
  assert.equal(selected.length, 0);
});

test('the funding split subtracts a figure that actually fits inside it', () => {
  /*
   * The self-hire count displayed under "Outside declared team" has to be the
   * self-hires within that set, not every self-hire: a team-funded self-hire
   * belongs to the team bucket, and subtracting the total from the funder
   * count printed arithmetic that did not add up on the live page.
   */
  const selfWallet = '0x0000000000000000000000000000000000000009' as const;
  const jobs = [
    job('1', 'COMPLETED', { client: BUYER_A }),
    job('2', 'COMPLETED', { client: BUYER_B }),
    job('3', 'COMPLETED', { client: selfWallet, provider: selfWallet }),
    job('4', 'COMPLETED', { client: TEAM, provider: TEAM }),
    job('5', 'COMPLETED', { client: TEAM }),
  ];
  const summary = summarizeProductionProof(jobs, (j) => j.client?.toLowerCase() === TEAM);

  assert.equal(summary.outsideTeamJobs, 3, 'two buyers plus the outside self-hire');
  assert.equal(summary.outsideSelfHireJobs, 1, 'only the outside-funded self-hire');
  assert.equal(summary.selfHireJobs, 2, 'both self-hires, including the team one');
  assert.equal(summary.outsideDemandJobs, 2);
  assert.equal(
    summary.outsideTeamJobs - summary.outsideSelfHireJobs,
    summary.outsideDemandJobs,
    'the split shown to a reader must be arithmetic they can check',
  );
});

/*
 * The figures below are all rendered on /proof. They had no coverage until a
 * displayed subtraction shipped wrong, which the receipt audit could not catch
 * because it compares the API to the chain and never reads the page. These pin
 * the rest of what a visitor is shown.
 */

test('buyer counts dedupe wallets by case and need two jobs to repeat', () => {
  const mixed = '0x00000000000000000000000000000000000000Aa' as const;
  const jobs = [
    job('1', 'COMPLETED', { client: mixed }),
    job('2', 'COMPLETED', { client: mixed.toLowerCase() as typeof mixed }),
    job('3', 'COMPLETED', { client: BUYER_B }),
  ];
  const summary = summarizeProductionProof(jobs, () => false);
  assert.equal(summary.uniqueKnownBuyers, 2, 'the same wallet in two cases is one buyer');
  assert.equal(summary.repeatKnownBuyers, 1, 'only the wallet with two jobs repeats');
});

test('a job with no recorded funder is counted as nobody, not as a buyer', () => {
  const jobs = [
    job('1', 'COMPLETED', { client: undefined }),
    job('2', 'COMPLETED', { client: BUYER_A }),
  ];
  const summary = summarizeProductionProof(jobs, () => false);
  assert.equal(summary.unknownFunderJobs, 1);
  assert.equal(summary.uniqueKnownBuyers, 1, 'an unknown funder must not inflate the buyer count');
  assert.equal(summary.repeatKnownBuyers, 0);
});

test('agents hired counts distinct identities, not jobs', () => {
  const jobs = [
    job('1', 'COMPLETED', { agentChainId: 56, agentTokenId: '7' }),
    job('2', 'COMPLETED', { agentChainId: 56, agentTokenId: '7' }),
    job('3', 'COMPLETED', { agentChainId: 97, agentTokenId: '7' }),
  ];
  const summary = summarizeProductionProof(jobs, () => false);
  /* The same token id on two chains is two identities, so the key carries the
     chain: counting token ids alone would merge a testnet and a mainnet agent. */
  assert.equal(summary.agentsHired, 2);
});

test('the status breakdown accounts for every job and terminal excludes live work', () => {
  const jobs = [
    job('1', 'COMPLETED'),
    job('2', 'REJECTED'),
    job('3', 'EXPIRED'),
    job('4', 'FUNDED'),
    job('5', 'SUBMITTED'),
  ];
  const summary = summarizeProductionProof(jobs, () => false);
  const counted = Object.values(summary.byStatus).reduce((sum, n) => sum + n, 0);
  assert.equal(counted, summary.jobs, 'a status breakdown that loses a job misstates the total');
  assert.equal(summary.terminal, 3, 'funded and submitted work has not finished');
  assert.equal(summary.active, 2);
  assert.equal(summary.completionRate, 1 / 3);
});

test('settled value counts only money that actually reached a provider', () => {
  const jobs = [
    job('1', 'COMPLETED', { budgetRaw: '1000' }),
    job('2', 'EXPIRED', { budgetRaw: '9999' }),
    job('3', 'FUNDED', { budgetRaw: '9999' }),
    job('4', 'REJECTED', { budgetRaw: '9999' }),
    job('5', 'COMPLETED', { budgetRaw: '500' }),
  ];
  const summary = summarizeProductionProof(jobs, () => false);
  assert.equal(summary.completedValueRaw, '1500', 'escrow that was reclaimed or refused is not revenue');
});

test('the freshness stamp is the newest check, whatever order the jobs arrive in', () => {
  const at = (id: string, statusCheckedAt: string) => job(id, 'COMPLETED', { statusCheckedAt });
  const summary = summarizeProductionProof(
    [at('1', '2026-10-12T00:00:00.000Z'), at('2', '2026-10-14T00:00:00.000Z'), at('3', '2026-10-13T00:00:00.000Z')],
    () => false,
  );
  assert.equal(summary.lastCheckedAt, '2026-10-14T00:00:00.000Z');
});

test('an empty view reports no completion rate rather than zero', () => {
  const summary = summarizeProductionProof([], () => false);
  assert.equal(summary.completionRate, null, 'zero per cent would claim a measurement nobody made');
  assert.equal(summary.jobs, 0);
  assert.equal(summary.lastCheckedAt, null);
});

test('accepted deliveries separate the lifecycle demos from the answers', () => {
  /*
   * The page published "13 Accepted deliveries" and an 87% terminal
   * completion rate above rows that each said "Lifecycle demo: no answer
   * from the agent". Five of the thirteen were demos, so the headline
   * overstated useful work by 38% while the detail underneath was honest.
   */
  const jobs = [
    job('1', 'COMPLETED', { client: BUYER_A }),
    job('2', 'COMPLETED', { client: BUYER_B }),
    job('3', 'COMPLETED', { client: BUYER_A }),
    job('4', 'EXPIRED', { client: BUYER_B }),
  ];
  const demos = new Set(['2']);
  const summary = summarizeProductionProof(jobs, () => false, (j) => demos.has(j.jobId));

  assert.equal(summary.completed, 3, 'the escrow fact is unchanged: three reached COMPLETED');
  assert.equal(summary.lifecycleDemoJobs, 1);
  assert.equal(summary.answeredDeliveries, 2, 'only the accepted jobs that carried an answer');
  assert.equal(
    summary.answeredDeliveries + summary.lifecycleDemoJobs + summary.completedSelfHires,
    summary.completed,
    'a reader must be able to check the two figures against the accepted count',
  );
  // The rate stays an escrow measure, so the demos do not change it.
  assert.equal(summary.completionRate, 3 / 4);
});

test('an unwired caller reports every accepted delivery as answered', () => {
  // Absent means "no demo is known", never "none exist": a caller that
  // cannot read manifests must not silently under-report useful work.
  const jobs = [job('1', 'COMPLETED', { client: BUYER_A }), job('2', 'COMPLETED', { client: BUYER_B })];
  const summary = summarizeProductionProof(jobs, () => false);

  assert.equal(summary.lifecycleDemoJobs, 0);
  assert.equal(summary.answeredDeliveries, summary.completed);
});

test('a self-hire settles like any job but is not counted as an answered delivery', () => {
  // Job 1444 on testnet: the buyer funded its own agent. Outside the team set, accepted, and still not demand.
  const SELLER = '0x9999999999999999999999999999999999999999';
  const jobs = [
    job('1', 'COMPLETED', { client: BUYER_A }),
    job('1444', 'COMPLETED', { client: SELLER, provider: SELLER }),
  ];
  const summary = summarizeProductionProof(jobs, () => false);
  assert.equal(summary.completed, 2);
  assert.equal(summary.completedSelfHires, 1);
  assert.equal(summary.answeredDeliveries, 1);
});
