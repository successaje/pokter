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

function minutes(seconds: number): string {
  if (seconds <= 90) return `${Math.max(1, Math.ceil(seconds))} seconds`;
  const mins = Math.ceil(seconds / 60);
  return mins === 1 ? 'a minute' : `${mins} minutes`;
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
        'This job passed its deadline before it was confirmed, so the escrow can no longer be released to the agent. The budget is yours to reclaim.',
    };
  }

  if (timing.submittedAt > 0 && timing.now < opensAt) {
    const opensInSeconds = opensAt - timing.now;
    return {
      allowed: false,
      reason: 'too-early',
      opensInSeconds,
      message: `The escrow holds a review window open for ${minutes(timing.disputeWindowSeconds)} after delivery, so payment cannot be released yet. Try again in ${minutes(opensInSeconds)} — nothing is lost by waiting, and you can contest the delivery until then.`,
    };
  }

  return { allowed: true };
}
