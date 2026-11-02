import { getAddress, type Address } from 'viem';

/** Check the live escrow state before asking a wallet to spend gas on a refund. */
export function assertRefundEligible(
  job: { client: Address; statusName: string; expiredAt: bigint },
  account: Address,
  now = Date.now(),
): void {
  if (getAddress(job.client) !== getAddress(account)) {
    throw new Error('The connected wallet did not fund this job.');
  }
  if (job.statusName !== 'FUNDED' && job.statusName !== 'SUBMITTED') {
    throw new Error(`This job is ${job.statusName.toLowerCase()}; there is no escrow left to reclaim.`);
  }
  if (Number(job.expiredAt) * 1000 > now) {
    throw new Error('This job has not expired yet. The agent still has time to deliver.');
  }
}
