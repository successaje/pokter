import { describeSeconds } from './deadline';

/**
 * When an escrow can actually be released, and when it cannot.
 *
 * Pokter offered "confirm delivery" the moment a seller submitted, and the
 * contract refused it. The refusal arrived as
 * "transaction gas limit too high (cap: 16777216, tx: 34863350)", which
 * is three steps from the truth: `settle` reverts, MetaMask's gas
 * estimate fails, it falls back to the block gas limit, and the RPC
 * rejects that as over its own cap. A buyer reads a number about gas and
 * has no way to learn that the answer is "wait fifteen minutes".
 *
 * The rule is the SDK's: approve calls Router.settle, valid once the
 * dispute window after submission has elapsed; dispute calls
 * Policy.dispute, valid only inside that window. Observed on BNB testnet
 * with a 900-second window — job 1440 was submitted at 08:56:05, refused
 * before 09:11:05, and completed afterwards.
 *
 * Expiry is the other edge and it is not symmetrical: past `expiredAt`
 * the escrow can no longer be released to the seller, only reclaimed by
 * the buyer. Two jobs sat delivered-but-unconfirmed past their deadline
 * while Pokter kept offering a button that could not work.
 *
 * Pure, because this decides what a buyer is told about their own money
 * and that deserves tests rather than a reading of the call site.
 */

export type SettleAction = 'approve' | 'dispute';

export type SettleVerdict =
  | { allowed: true }
  | { allowed: false; reason: 'too-early'; opensInSeconds: number; message: string }
  | { allowed: false; reason: 'window-closed'; message: string }
  | { allowed: false; reason: 'expired'; message: string };

export interface SettleTiming {
  /** Seconds since epoch the seller submitted, or 0 when it has not. */
  submittedAt: number;
  /** Seconds since epoch the job's deadline passes. */
  expiredAt: number;
  /** The policy's dispute window, in seconds. */
  disputeWindowSeconds: number;
  /** Seconds since epoch, now. */
  now: number;
}

/*
 * At the scale of the window. Mainnet's is 7 days, and "10080 minutes" is
 * how the first mainnet buyer to approve a delivery was told so.
 */
function span(seconds: number): string {
  if (seconds <= 90) return `${Math.max(1, Math.ceil(seconds))} seconds`;
  if (seconds < 3600) {
    const mins = Math.ceil(seconds / 60);
    return mins === 1 ? 'a minute' : `${mins} minutes`;
  }
  return describeSeconds(Math.ceil(seconds / 60) * 60);
}

function utcMoment(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;
}

export function settleOpensAt(timing: Pick<SettleTiming, 'submittedAt' | 'disputeWindowSeconds'>): number {
  return timing.submittedAt + timing.disputeWindowSeconds;
}

export function canSettle(action: SettleAction, timing: SettleTiming): SettleVerdict {
  const opensAt = settleOpensAt(timing);

  if (action === 'dispute') {
    /*
     * Inside the window only. After it, the seller's claim stands and
     * the contract has nothing left to contest.
     */
    if (timing.submittedAt > 0 && timing.now >= opensAt) {
      return {
        allowed: false,
        reason: 'window-closed',
        message:
          'The review window has closed, so this delivery can no longer be contested. Releasing the payment is the remaining action.',
      };
    }
    return { allowed: true };
  }

  /*
   * Expiry first. A job past its deadline cannot pay the seller however
   * long ago it was delivered, and saying "wait" to somebody whose wait
   * is already over would be the worse error.
   */
  if (timing.now >= timing.expiredAt) {
    return {
      allowed: false,
      reason: 'expired',
      message:
        'This job passed its deadline before it was settled, so the escrow can no longer be released to the agent. The budget is yours to reclaim.',
    };
  }

  if (timing.submittedAt > 0 && timing.now < opensAt) {
    const opensInSeconds = opensAt - timing.now;
    return {
      allowed: false,
      reason: 'too-early',
      opensInSeconds,
      message: `Payment can’t be released yet: the escrow keeps a review window of ${span(timing.disputeWindowSeconds)} after delivery. It opens ${utcMoment(opensAt)} (in ${span(opensInSeconds)}). Until then you can dispute the delivery; nothing is lost by waiting.`,
    };
  }

  return { allowed: true };
}

/**
 * What the buyer of a delivered job is told about its review window.
 *
 * The job page said "release payment or dispute it within the window" and,
 * a paragraph later, that the escrow will not release early: two
 * instructions that contradict each other, and no date for either. The
 * window's close is the one moment a buyer needs, so it is stated, with
 * what they can do before it and what happens after.
 */
export function reviewWindowSummary(timing: SettleTiming): { open: boolean; closesAt: number; closes: string; text: string } {
  const closesAt = settleOpensAt(timing);
  const closes = utcMoment(closesAt);
  if (timing.now < closesAt) {
    return {
      open: true,
      closesAt,
      closes,
      text: `The review window closes ${closes} (in ${span(closesAt - timing.now)}). Until then you can dispute the delivery. After it, the payment can be released to the agent, by you or by anyone, and it can no longer be disputed.`,
    };
  }
  return {
    open: false,
    closesAt,
    closes,
    text: `The review window closed ${closes}. The payment can now be released to the agent, by you or by anyone; the delivery can no longer be disputed.`,
  };
}

/**
 * What the buyer of a disputed job is told.
 *
 * A dispute leaves the job SUBMITTED while whitelisted voters decide:
 * `quorum` reject votes make it REJECTED and the escrow refundable; with
 * no quorum by the deadline it expires and the buyer reclaims it then.
 * Either way the delivery is no longer approved by silence.
 */
export function disputeSummary(input: { rejectVotes: number; quorum: number; expiredAt: number; now: number }): { title: string; text: string } {
  const deadline = utcMoment(input.expiredAt);
  const votes = input.quorum > 0 ? `${input.rejectVotes} of ${input.quorum} reject votes so far` : `${input.rejectVotes} reject votes so far`;
  const past = input.now >= input.expiredAt;
  return {
    title: 'You disputed this delivery',
    text: past
      ? `The vote did not reach its quorum (${votes}) before the deadline, ${deadline}, so the job has expired and the escrow can be reclaimed.`
      : `The escrow policy's voters decide: ${votes}. At ${input.quorum || 'the quorum'} the job is rejected and you can reclaim the escrow. If the quorum is not reached by the deadline, ${deadline}, the job expires and you reclaim it then. Until one of those happens the agent cannot be paid.`,
  };
}

/**
 * Who may release an escrow, as distinct from when.
 *
 * `canSettle` above answers the timing. This answers the caller, and the
 * two are not the same question: Pokter's release button is gated on being
 * the buyer, which is a Pokter rule and not necessarily the contract's.
 *
 * Measured by simulation on BNB testnet (eth_call, nothing sent) against
 * job 1460, from the buyer and from an address with no relationship to the
 * job:
 *
 *   settle   buyer 0x17be5b7b · stranger 0x17be5b7b   identical
 *   dispute  buyer 0x58ae8479 · stranger 0x20dbc874   different
 *
 * So the contracts do distinguish callers where they mean to — `dispute`
 * turns a stranger away with its own error, matching the SDK's
 * "client-only" — and `settle` does not appear to. That is evidence rather
 * than proof: a caller check placed after the state check would look the
 * same on a job that is not settleable yet, and no job was in the
 * delivered-and-past-window state to test against.
 *
 * Which is why nothing here asserts it. The answer is `'ask-the-chain'`,
 * and any surface that wants to offer a non-buyer a release must simulate
 * that exact call first and report what the chain said. An assumption in
 * either direction is a button that reverts, or a payment nobody collects.
 */
export type SettleCaller = 'buyer' | 'seller' | 'anyone-else';

export function settleCallerRule(action: SettleAction): 'client-only' | 'ask-the-chain' {
  /*
   * `dispute` is the SDK's documented client-only call, and the differing
   * revert above is the contract agreeing. `settle` is the open question.
   */
  return action === 'dispute' ? 'client-only' : 'ask-the-chain';
}

/**
 * Whether Pokter may offer this caller a release without asking the chain.
 *
 * Only the buyer, and only because that is the path with on-chain
 * precedent: every completed job settled that way. Everyone else needs a
 * simulation, including the seller — whose own payment it is.
 */
export function mayOfferSettleUnchecked(caller: SettleCaller): boolean {
  return caller === 'buyer';
}
