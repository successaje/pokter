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
 * stayed `FUNDED`.
 *
 * Two further sets have since behaved the same way. #1364 and #1365 were
 * reclaimed and are now `EXPIRED`; #1372 and #1373 sat at `FUNDED` a day
 * past expiry, were reclaimed, and turned `EXPIRED` within the hour. Three
 * independent observations, no counter-example.
 *
 * It is still observation of one deployment rather than a reading of the
 * kernel, so `EXPIRED` keeps offering the action. Wrongly offering it costs
 * a reverted transaction and the gas on it; wrongly hiding it strands
 * somebody's money. Those are not the same mistake, and no number of
 * confirmations of the cheap direction justifies taking the expensive one.
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
