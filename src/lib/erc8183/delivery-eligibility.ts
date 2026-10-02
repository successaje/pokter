/**
 * Whether a funded job should be delivered again.
 *
 * Extracted from the retry so it can be tested without a chain. The three
 * refusals each exist for a different reason and a regression in any one of
 * them spends gas, or delivers something nobody is owed.
 */
export type RetryDecision =
  | { retry: true }
  | { retry: false; reason: string };

export function shouldRetryDelivery(job: {
  statusName: string;
  expiredAtMs: number;
  providerIsOurSeller: boolean;
}, now: number): RetryDecision {
  if (job.statusName !== 'FUNDED') {
    return { retry: false, reason: `already ${job.statusName.toLowerCase()}` };
  }
  /*
   * An expired escrow belongs back with the buyer. Submitting into one spends
   * gas on a transaction the contract refuses, and would be the wrong answer
   * even if it worked.
   */
  if (job.expiredAtMs <= now) {
    return { retry: false, reason: 'expired — reclaimable by the buyer' };
  }
  /*
   * Only our own seller. Another agent's job is theirs to deliver, and Pokter
   * holds no key that could submit for them.
   */
  if (!job.providerIsOurSeller) {
    return { retry: false, reason: 'provider is not the Pokter seller' };
  }
  return { retry: true };
}
