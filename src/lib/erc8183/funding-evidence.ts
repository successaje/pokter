import type { HiredJob, JobStatusName } from './types';

/**
 * Whether the escrow itself proves a job was funded.
 *
 * Read from the contract's rules, not from Pokter's records of a hire. The
 * escrow implementation sets each status in one function only: Funded in
 * `fund`, Submitted in `submit` from Funded, Completed in `complete` from
 * Submitted, and Expired in `claimRefund` from Funded or Submitted. So any
 * of those four, read from the chain, proves the buyer's money went into
 * escrow. Rejected does not: `reject` also closes a job that was never
 * funded. Created has not been funded.
 *
 * Checked on 28 Oct 2026 against the mainnet implementation's verified
 * source (0xe8d47866e2cc3dcaa50f0ad980355695b2f1d533), with the testnet
 * implementation (0x55c3826b39a0f671b2c3e5d0f1372cad0b911421) the same
 * bytecode but for its own address. The escrow is upgradeable: an upgrade
 * has to be checked against this rule before it is relied on.
 *
 * A job funded with no budget moved no money, and is not a paid hire.
 */
export type FundingEvidence = 'funded' | 'not-funded' | 'unproven';

const PROVES_FUNDING: ReadonlySet<JobStatusName> = new Set(['FUNDED', 'SUBMITTED', 'COMPLETED', 'EXPIRED']);

export function fundingEvidence(job: Pick<HiredJob, 'status' | 'budgetRaw'>): FundingEvidence {
  if (job.status === 'OPEN') return 'not-funded';
  if (!PROVES_FUNDING.has(job.status)) return 'unproven';
  let budget: bigint;
  try {
    budget = BigInt(job.budgetRaw);
  } catch {
    return 'unproven';
  }
  return budget > 0n ? 'funded' : 'not-funded';
}
