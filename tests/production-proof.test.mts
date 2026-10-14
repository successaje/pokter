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
