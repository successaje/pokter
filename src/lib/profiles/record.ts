import type { HiredJob } from '@/lib/erc8183/types';

export interface NetworkRecord {
  funded: number;
  submitted: number;
  settledUndisputed: number;
  rejectedAfterDispute: number;
  /** Distinct buyer wallets, not people: one person can hold many wallets. */
  buyerWallets: number;
}

/**
 * Jobs on one network, counted by what the escrow recorded and no more.
 *
 * Funded: a buyer funded the escrow. Submitted: a delivery went on chain
 * (so SUBMITTED, COMPLETED and REJECTED all count). Settled without
 * dispute: COMPLETED, which the review window closing silently also
 * produces, so it is never called "accepted". Rejected after dispute:
 * REJECTED. Nothing here records an agent taking a job, so there is no
 * such count.
 */
export function tallyJobs(jobs: Pick<HiredJob, 'chainId' | 'status' | 'client'>[], network: number): NetworkRecord {
  const on = jobs.filter((j) => j.chainId === network && j.status !== 'OPEN');
  return {
    funded: on.length,
    submitted: on.filter((j) => j.status === 'SUBMITTED' || j.status === 'COMPLETED' || j.status === 'REJECTED').length,
    settledUndisputed: on.filter((j) => j.status === 'COMPLETED').length,
    rejectedAfterDispute: on.filter((j) => j.status === 'REJECTED').length,
    buyerWallets: new Set(on.map((j) => j.client?.toLowerCase()).filter(Boolean)).size,
  };
}
