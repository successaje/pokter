/**
 * What a funding attempt actually did, when the wallet stopped telling us.
 *
 * `wallet_sendCalls` is waited on for a confirmation and gives up with
 * `BATCH_CONFIRMATION_TIMEOUT`. Nothing caught that by name, so it reached
 * the buyer as an ordinary error beside a retry — and a retry after a
 * funding that had in fact landed creates a second job and pays twice.
 *
 * The timeout says only that we stopped watching. The chain says what
 * happened. So the decision is made from the job the attempt predicted,
 * read back from the escrow:
 *
 * - `funded`: the predicted job exists and matches this attempt in every
 *   field. The hire succeeded; adopt it and never re-fund.
 * - `not-funded`: the predicted id holds nothing. The money did not move,
 *   so a retry is safe.
 * - `taken`: the id exists but belongs to someone else's job — ids are
 *   assigned by a counter, and a concurrent hire can take the one we
 *   predicted. This does **not** prove our funding failed; ours may have
 *   landed at a later id. Unknown, and a retry is not offered.
 * - `mismatch`: the id is ours by client and provider but a field differs.
 *   Something was funded that is not what was agreed, which a buyer has to
 *   see rather than retry past.
 *
 * The brief's rule, in one line: indexer absence is not proof that funding
 * failed. Neither is a timeout.
 */

export type FundingOutcome = 'funded' | 'not-funded' | 'taken' | 'mismatch';

export interface FundedJobFields {
  client: string;
  provider: string;
  budget: bigint;
  description: string;
  statusName: string;
}

export interface FundingExpectation {
  account: string;
  provider: string;
  budget: bigint;
  description: string;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function fundingOutcome(onchain: FundedJobFields | null, expected: FundingExpectation): FundingOutcome {
  // An id the counter has not reached holds a zero job: no client, no money.
  if (!onchain || !onchain.client || /^0x0{40}$/i.test(onchain.client)) return 'not-funded';

  const ours = same(onchain.client, expected.account) && same(onchain.provider, expected.provider);
  if (!ours) return 'taken';

  if (onchain.budget !== expected.budget || onchain.description !== expected.description) return 'mismatch';

  /*
   * A job that is ours and already moved past FUNDED — delivered, settled,
   * expired — was still funded by this attempt. Only a job that never
   * reached FUNDED at all counts as money that did not move.
   */
  return onchain.statusName === 'CREATED' ? 'not-funded' : 'funded';
}

/** Whether a retry may be offered without risking a second payment. */
export function retrySafe(outcome: FundingOutcome): boolean {
  return outcome === 'not-funded';
}

/** What to tell the buyer, when the attempt did not resolve cleanly. */
export function describeFundingOutcome(outcome: FundingOutcome): string {
  switch (outcome) {
    case 'funded':
      return 'The funding did go through — the wallet stopped reporting before the confirmation arrived. Your job is funded and nothing further is needed.';
    case 'not-funded':
      return 'The funding did not go through: nothing was taken from your wallet and no job was created. You can try again.';
    case 'taken':
      return 'The confirmation did not arrive and another job took the id this attempt expected, so Pokter cannot yet tell whether your funding landed. Check your wallet activity before trying again — a retry could pay twice.';
    case 'mismatch':
      return 'A job was funded from your wallet to this provider, but its terms do not match what was agreed. Do not retry; open the job and check it.';
  }
}
