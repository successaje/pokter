import { describeFundingOutcome, fundingOutcome, retrySafe, type FundingOutcome } from '@/lib/hire/funding-outcome';

/**
 * What happened to a funding attempt an assistant cannot account for.
 *
 * The browser already answers this question when the wallet stops
 * reporting: `funding-outcome` reads the predicted job back from the escrow
 * and refuses to offer a retry for anything but `not-funded`, because
 * "indexer absence is not proof that funding failed. Neither is a timeout."
 * A tool chain loses contact far more often than a tab does — a dropped
 * connection, a restarted process, a caller that retried above us — so the
 * same reading is the first thing a retry does here.
 *
 * It reuses that decision rather than restating it, with one difference
 * that has to be said plainly. `fundingOutcome` compares the on-chain
 * description with the description the attempt sent. Pokter never sees that
 * string on this path: the owner's own wallet encodes the `pokter-job`
 * envelope at signing time, and it carries the quote anchor the wallet
 * held. So the comparable part is the brief inside it, which
 * `jobTaskFromDescription` reads, and the caller passes that in. A job
 * whose brief is not this request's brief is a mismatch, exactly as a job
 * whose budget differs is.
 */

export interface UncertainHire {
  /** The job as the escrow holds it, or null when the id holds nothing. */
  onchain: {
    client: string;
    provider: string;
    budget: bigint;
    statusName: string;
    /** The brief the description carries, as Pokter's own decoder reads it. */
    task: string | null;
  } | null;
  expect: {
    /** The wallet that would have funded it: the owner's own. */
    owner: string;
    provider: string;
    amountRaw: string;
    task: string;
  };
}

export interface Reconciled {
  outcome: FundingOutcome;
  /** Whether this request may be offered for approval again. */
  retrySafe: boolean;
  message: string;
}

export function reconcileUncertainHire(input: UncertainHire): Reconciled {
  let budget: bigint;
  try {
    budget = BigInt(input.expect.amountRaw);
  } catch {
    return {
      outcome: 'mismatch',
      retrySafe: false,
      message: 'The amount this request was prepared for is not a whole number of token units, so nothing on chain can be compared with it. Do not retry; have a human read the job.',
    };
  }

  const expectation = {
    account: input.expect.owner,
    provider: input.expect.provider,
    budget,
    /* Compared through the brief below rather than here, for the reason in
       this file's note: the envelope was written by the owner's wallet. */
    description: input.onchain?.task ?? '',
  };
  const outcome = fundingOutcome(
    input.onchain ? { ...input.onchain, description: input.onchain.task ?? '' } : null,
    expectation,
  );

  /*
   * A job that is ours by client, provider and budget, carrying a brief
   * that is not the one this request was prepared for, is money spent on
   * other work. `fundingOutcome` would already have called that a mismatch
   * had the descriptions been comparable; this is the same finding, reached
   * through the decoder.
   */
  if (outcome === 'funded' && input.onchain && input.onchain.task !== input.expect.task) {
    return {
      outcome: 'mismatch',
      retrySafe: false,
      message:
        input.onchain.task === null
          ? 'A job was funded from this wallet to this provider for this amount, but its description is not a Pokter job envelope, so the brief it was funded with cannot be read. Do not retry; have a human open the job.'
          : `${describeFundingOutcome('mismatch')} Its brief is not the one this request was prepared for.`,
    };
  }

  return {
    outcome,
    /* `not-funded` alone, by the browser path's own rule. */
    retrySafe: retrySafe(outcome),
    message: describeFundingOutcome(outcome),
  };
}
