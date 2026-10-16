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
  | { allowed: false; reason: 'expired'; message: string }
  /** The caller may never make this call, whatever the timing. */
  | { allowed: false; reason: 'not-your-call'; message: string };

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
 * `canSettle` above answers the timing. This answers the caller, and they
 * are different questions: Pokter's release button is gated on being the
 * buyer, which was Pokter's rule and nobody had checked whether it was the
 * contract's.
 *
 * It is not. Settled on chain, BNB testnet, job #1502:
 *
 *   buyer    0x93847647d7eb72a69E162117df6a8697dF53EDda
 *   provider 0xB72335e083A7eed9731D24C48dbf07c4Ef1f051a  (Brinkwatch)
 *   settler  0x5CbDd86a2FA8Dc4bDdd8a8f69dBa48572EeC07FB  (neither)
 *
 * The third address held nothing but gas. After the 900-second window
 * closed it called `Router.settle(1502, "0x")` in
 * 0x78900c506b00ac114bc0658c69e39738ee141180e59b9ebc801b940b0a2e1ff6,
 * the job became COMPLETED, and the provider's balance went from 0.5 $U
 * to 0.6 $U. So an escrow is released to the seller by anybody at all,
 * and Pokter's "the payment can be released afterwards without you" is a
 * fact rather than a claim.
 *
 * `dispute` is the opposite, and the contrast is what makes the result
 * legible. Inside the window it succeeds only for the buyer and refuses
 * everyone else with `0x20dbc874`, which is `NotClient()` — confirmed by
 * preimage, not guessed. The contracts have a caller gate and use it;
 * `settle` simply does not have one. Before the window both calls refuse
 * everybody including the buyer, with `0x17be5b7b`, so that one is about
 * state rather than identity.
 */
export type SettleCaller = 'buyer' | 'seller' | 'anyone-else';

/** Whether this caller may make this call at all, timing aside. */
export function settleCallerAllowed(action: SettleAction, caller: SettleCaller): boolean {
  return action === 'dispute' ? caller === 'buyer' : true;
}

/**
 * The whole answer: may this caller do this, now?
 *
 * Both halves in one place, because a surface that offers a release to
 * somebody other than the buyer needs the timing *and* the caller rule,
 * and checking one of them is how a button that reverts gets shipped.
 */
export function canSettleAs(
  action: SettleAction,
  caller: SettleCaller,
  timing: SettleTiming,
): SettleVerdict {
  if (!settleCallerAllowed(action, caller)) {
    return {
      allowed: false,
      reason: 'not-your-call',
      message:
        'Only the wallet that funded this job can contest a delivery. Releasing the payment, once the review window has closed, is open to anyone.',
    };
  }
  const verdict = canSettle(action, timing);
  /*
   * The same refusal, addressed to the right person. `canSettle` speaks to
   * the buyer, so its expiry message offers the budget back — which to a
   * seller reads as their own money being returned to them.
   */
  if (caller === 'seller' && verdict.allowed === false && verdict.reason === 'expired') {
    return {
      ...verdict,
      message:
        'This job passed its deadline before anyone released it, so the escrow can no longer be paid out. The budget returns to the buyer.',
    };
  }
  return verdict;
}

/**
 * What the seller of a delivered job is told, and whether they can act.
 *
 * The mirror of `reviewWindowSummary`, which tells the buyer the same
 * window from the other side. A seller used to see only "Buyer reviewing",
 * for as long as that was true and for ever afterwards — so work that
 * nobody was reviewing any more, and that the seller could have collected
 * themselves, looked identical to work still under review.
 */
export function sellerReleaseSummary(timing: SettleTiming): {
  state: 'waiting' | 'ready' | 'expired';
  opensAt: number;
  opens: string;
  label: string;
  text: string;
} {
  const opensAt = settleOpensAt(timing);
  const opens = utcMoment(opensAt);
  if (timing.now >= timing.expiredAt) {
    return {
      state: 'expired',
      opensAt,
      opens,
      label: 'Expired unpaid',
      text: 'This job passed its deadline before anyone released it, so it can no longer be paid out. The budget returns to the buyer.',
    };
  }
  if (timing.now < opensAt) {
    return {
      state: 'waiting',
      opensAt,
      opens,
      label: 'Buyer reviewing',
      text: `The buyer can dispute this delivery until ${opens} (${span(opensAt - timing.now)} away). After that you can release the payment to yourself, and it can no longer be disputed.`,
    };
  }
  return {
    state: 'ready',
    opensAt,
    opens,
    label: 'Ready to collect',
    text: `The review window closed ${opens}, so this delivery can no longer be disputed. You can release the payment to yourself — you pay the gas, the escrow pays you.`,
  };
}
