/**
 * When an expired escrow may be pulled back.
 *
 * Lives outside the card so the rule can be tested and so the card and any
 * other surface cannot drift apart about it.
 *
 * The trap it exists to avoid: an escrow that has expired still sits at
 * `FUNDED`. Gating on the status label alone would have rendered the action
 * for nobody, while several screens carried on telling people the money was
 * theirs to reclaim.
 *
 * `EXPIRED` is observed to appear when the refund is claimed: job #1363 was
 * `FUNDED` and months past expiry until it was reclaimed, at which point it
 * became `EXPIRED`, while #1364 and #1365 — equally expired, not reclaimed —
 * stayed `FUNDED`. That is one clean observation rather than a reading of the
 * kernel, so `EXPIRED` still offers the action: wrongly offering it costs a
 * reverted transaction and the gas on it, while wrongly hiding it strands
 * somebody's money, and those are not the same mistake.
 *
 * `now` is passed in rather than read here, because the caller is a React
 * render and reading the clock during one is impure.
 */
export function isReclaimable(
  job: { status: string; expiredAt: string; reclaimTxHash?: string | null },
  now: number,
): boolean {
  return (
    (job.status === 'FUNDED' || job.status === 'EXPIRED') &&
    Date.parse(job.expiredAt) <= now &&
    !job.reclaimTxHash
  );
}
