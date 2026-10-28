import assert from 'node:assert/strict';
import test from 'node:test';

import { fundingEvidence } from '../src/lib/erc8183/funding-evidence';
import { summarizeProductionProof } from '../src/lib/erc8183/production-proof';
import type { HiredJob, JobStatusName } from '../src/lib/erc8183/types';

/*
 * A funded hire is a job the escrow's own status proves was funded with
 * money. The escrow sets Funded only in `fund`, and Submitted, Completed
 * and Expired only from a funded job; `reject` also closes a job that was
 * never funded, and Created was never funded.
 */

function job(id: string, status: JobStatusName, options: Partial<HiredJob> = {}): HiredJob {
  return {
    id, jobId: id, chainId: 56, isTestnet: false, agentChainId: 56, agentTokenId: id, agentName: `Agent ${id}`,
    provider: `0x${id.padStart(40, '0')}` as `0x${string}`, client: '0x00000000000000000000000000000000000000b2', task: 't', budgetRaw: '100',
    expiredAt: '2026-10-14T00:00:00.000Z', hiredAt: '2026-10-10T00:00:00.000Z', hireTxHash: null, status,
    statusCheckedAt: '2026-10-11T00:00:00.000Z', deliverableUrl: null, settleTxHash: null, ...options,
  };
}

test('Funded, Delivered, Settled and Expired prove funding; Created does not; Rejected is not proven', () => {
  assert.deepEqual(
    (['FUNDED', 'SUBMITTED', 'COMPLETED', 'EXPIRED', 'OPEN', 'REJECTED'] as const).map((status) => fundingEvidence(job('1', status))),
    ['funded', 'funded', 'funded', 'funded', 'not-funded', 'unproven'],
  );
  assert.equal(fundingEvidence(job('1', 'COMPLETED', { budgetRaw: '0' })), 'not-funded', 'funded with no budget moved no money');
  assert.equal(fundingEvidence(job('1', 'EXPIRED', { budgetRaw: 'n/a' })), 'unproven');
});

test('the summary counts funded hires, names what is not one, and counts agents by their funded hires', () => {
  const summary = summarizeProductionProof([
    job('1', 'COMPLETED'), job('2', 'SUBMITTED'), job('3', 'EXPIRED'),
    job('4', 'OPEN'), job('5', 'REJECTED'), job('6', 'COMPLETED', { budgetRaw: '0' }),
  ], () => false);
  assert.equal(summary.jobs, 6);
  assert.equal(summary.fundedHires, 3);
  assert.equal(summary.notFunded, 2);
  assert.equal(summary.fundingUnproven, 1);
  assert.equal(summary.fundedHires + summary.notFunded + summary.fundingUnproven, summary.jobs, 'every job is in exactly one of the three');
  assert.equal(summary.agentsHired, 3, 'an agent whose only job was never funded was not hired');
  assert.equal(summary.agentRegistrationsHired, 3);
});
