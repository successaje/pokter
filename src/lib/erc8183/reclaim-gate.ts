/**
 * When an expired escrow may be pulled back.
 *
 * Lives outside the card so the rule can be tested and so the card and any
 * other surface cannot drift apart about it.
 *
 * The trap it exists to avoid: every expired escrow on this deployment sits
 * at `FUNDED`, because the kernel only reports `EXPIRED` once something asks
 * it to. Gating on the status label alone would have rendered the action for
 * nobody, while several screens carried on telling people the money was
 * theirs to reclaim.
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
