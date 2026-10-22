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
 * Which comparisons come from where, because this is not a straight reuse
 * and reading it as one would hide two false verdicts:
 *
 *  - **The funding wallet, the provider and the status** come from
 *    `fundingOutcome`. That logic is the valuable part: an id the counter
 *    has not reached, somebody else's job at the id this attempt predicted,
 *    and a job of ours that never left CREATED are three different facts,
 *    and only the last of them is money that did not move.
 *  - **The brief** is compared here, through `jobTaskFromDescription`.
 *    `fundingOutcome` compares the on-chain description against the one the
 *    attempt sent, and Pokter never sees that string on this path: the
 *    owner's own wallet encodes the `pokter-job` envelope at signing time,
 *    carrying the quote anchor the wallet held. The brief inside it is the
 *    comparable part.
 *  - **The amount** is compared against the owner's ceiling rather than
 *    against a price, and this was wrong before. The old check demanded the
 *    funded budget equal *this retry's fresh quote*, which made `mismatch`
 *    the usual answer in the two commonest cases: a re-quote, which is
 *    precisely what the request key is designed to tolerate, and an owner
 *    who funded their own budget rather than the quoted price — `useHire`
 *    funds `budgetU`, which the buyer edits. So a funded job counts when it
 *    holds something and holds no more than the owner authorised, and the
 *    figure it actually holds is reported back for a human to read.
 *
 * What still stops: a payment to the wrong provider, for the wrong work, or
 * above the ceiling. Those are the three that mean money went somewhere
 * nobody agreed to.
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
    /** The most the owner authorised, in raw units. Not a price. */
    ceilingRaw: string;
    task: string;
  };
}

export interface Reconciled {
  outcome: FundingOutcome;
  /** Whether this request may be offered for approval again. */
  retrySafe: boolean;
  /** What the job on chain actually holds, when one does. */
  fundedAmountRaw: string | null;
  message: string;
}

export function reconcileUncertainHire(input: UncertainHire): Reconciled {
  let ceiling: bigint;
  try {
    ceiling = BigInt(input.expect.ceilingRaw);
  } catch {
    return {
      outcome: 'mismatch',
      retrySafe: false,
      fundedAmountRaw: null,
      message: 'The ceiling this request was prepared under is not a whole number of token units, so nothing on chain can be compared with it. Do not retry; have a human read the job.',
    };
  }

  const funded = input.onchain?.budget ?? null;
  /*
   * The budget is neutralised inside `fundingOutcome` — both sides are the
   * figure on chain — because the amount question is answered below against
   * the ceiling. The description is neutralised for the same reason: the
   * brief is compared after. What is left to it is the part only it knows
   * how to judge.
   */
  const outcome = fundingOutcome(
    input.onchain ? { ...input.onchain, description: input.onchain.task ?? '' } : null,
    {
      account: input.expect.owner,
      provider: input.expect.provider,
      budget: funded ?? 0n,
      description: input.onchain?.task ?? '',
    },
  );

  const amount = funded === null ? null : funded.toString();

  if (outcome === 'funded' && input.onchain) {
    /*
     * Ours, funded, and for work nobody asked for. `fundingOutcome` would
     * have called this a mismatch had the descriptions been comparable;
     * this is the same finding, reached through the decoder.
     */
    if (input.onchain.task !== input.expect.task) {
      return {
        outcome: 'mismatch',
        retrySafe: false,
        fundedAmountRaw: amount,
        message:
          input.onchain.task === null
            ? 'A job was funded from this wallet to this provider, but its description is not a Pokter job envelope, so the brief it was funded with cannot be read. Do not retry; have a human open the job.'
            : `${describeFundingOutcome('mismatch')} Its brief is not the one this request was prepared for.`,
      };
    }
    /*
     * And above what the owner authorised, which is the one thing about the
     * amount that is not the owner's business to vary.
     */
    if (funded !== null && funded > ceiling) {
      return {
        outcome: 'mismatch',
        retrySafe: false,
        fundedAmountRaw: amount,
        message: `A job was funded from this wallet for this work, but it holds ${amount} raw units and the owner authorised at most ${input.expect.ceilingRaw}. Do not retry; have a human open the job.`,
      };
    }
    if (funded === null || funded <= 0n) {
      return {
        outcome: 'not-funded',
        retrySafe: true,
        fundedAmountRaw: amount,
        message: `${describeFundingOutcome('not-funded')} The job exists but holds nothing.`,
      };
    }
    return {
      outcome: 'funded',
      retrySafe: false,
      fundedAmountRaw: amount,
      /* The figure on chain, not the figure quoted: the owner may have
         funded their own budget, and what they funded is what it holds. */
      message: `${describeFundingOutcome('funded')} It holds ${amount} raw units, within the ${input.expect.ceilingRaw} the owner authorised.`,
    };
  }

  return {
    outcome,
    /* `not-funded` alone, by the browser path's own rule. */
    retrySafe: retrySafe(outcome),
    fundedAmountRaw: amount,
    message: describeFundingOutcome(outcome),
  };
}
