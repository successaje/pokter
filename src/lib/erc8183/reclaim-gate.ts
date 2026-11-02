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
 * ERC-8183 makes EXPIRED terminal: that status means the refund has already
 * been claimed. An unsettled SUBMITTED job is refundable after expiry too.
 *
 * `now` is passed in rather than read here, because the caller is a React
 * render and reading the clock during one is impure.
 */
export function isReclaimable(
  job: { status: string; expiredAt: string; reclaimTxHash?: string | null; disputeTxHash?: string | null },
  now: number,
): boolean {
  if (job.reclaimTxHash) return false;
  return (job.status === 'FUNDED' || job.status === 'SUBMITTED') && Date.parse(job.expiredAt) <= now;
}
