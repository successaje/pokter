/**
 * How long a job Pokter creates stays open.
 *
 * The policy only accepts a submission while its whole dispute window still
 * fits before the job's deadline: `submit` reverts (0x15e5dd74) once less
 * than `disputeWindow()` remains. That window is 15 minutes on testnet and
 * 7 days on mainnet, so the fixed 24-hour deadline Pokter used worked on
 * one and could never be delivered on the other: every mainnet job Pokter
 * created was undeliverable from the moment it was funded.
 *
 * So the deadline is the seller's delivery time plus the chain's own
 * dispute window, read from the policy of the escrow being funded rather
 * than assumed. The cost is real and shown to the buyer before funding:
 * if nothing is delivered, the escrow can only be reclaimed after the
 * whole deadline, which on mainnet is about eight days.
 */
export const DELIVERY_WINDOW_SECONDS = 24 * 60 * 60;

export function jobLifetimeSeconds(disputeWindowSeconds: number | bigint, deliverySeconds = DELIVERY_WINDOW_SECONDS): number {
  const window = Number(disputeWindowSeconds);
  if (!Number.isFinite(window) || window < 0) throw new Error('INVALID_DISPUTE_WINDOW');
  return window + deliverySeconds;
}

/**
 * The seller's delivery time for one hire.
 *
 * A proposal chosen on a request promises "delivered within N days", and
 * the job funded from it must allow that: hiring with the fixed 24 hours
 * turned a 7-day proposal into a job that expired after one. Request bids
 * are bounded to 1–30 days where they are made; anything else falls back
 * to the standing window rather than to an unbounded deadline.
 */
export const PROPOSAL_DELIVER_DAYS = { min: 1, max: 30 } as const;

export function deliverySecondsFor(deliverDays: number | null | undefined): number {
  return typeof deliverDays === 'number'
    && Number.isInteger(deliverDays)
    && deliverDays >= PROPOSAL_DELIVER_DAYS.min
    && deliverDays <= PROPOSAL_DELIVER_DAYS.max
    ? deliverDays * 86_400
    : DELIVERY_WINDOW_SECONDS;
}

/** "24 hours", "7 days", "8 days": the resolution a buyer reads a deadline at. */
export function describeSeconds(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 48 * 3600) {
    // Exact to the minute: the buyer is being told when their money is free.
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return `${hours} hour${hours === 1 ? '' : 's'}${minutes ? ` ${minutes} minutes` : ''}`;
  }
  const days = Math.round(seconds / 86_400);
  return `${days} days`;
}

/** The deadline row on the hire page, in the buyer's terms. */
export function deadlineTerms(disputeWindowSeconds: number, deliverySeconds: number = DELIVERY_WINDOW_SECONDS): { deadline: string; reclaim: string } {
  const total = jobLifetimeSeconds(disputeWindowSeconds, deliverySeconds);
  return {
    deadline: `${describeSeconds(total)} from funding: ${describeSeconds(deliverySeconds)} for the agent to deliver, then the escrow’s review window of ${describeSeconds(disputeWindowSeconds)}`,
    reclaim: `You reclaim the full amount after the deadline, ${describeSeconds(total)} from funding`,
  };
}
