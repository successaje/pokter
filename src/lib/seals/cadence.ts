/**
 * How often a seal is published, and what to do when one is overdue.
 *
 * Pure, and kept out of `run.ts`, which is `server-only` and so cannot be
 * imported by a test. This is the arithmetic that decides whether a
 * scheduled sweep spends gas — the part that silently starts anchoring
 * every few minutes if somebody changes a constant.
 *
 * Once a day. The claims a seal covers barely move between sweeps, and a
 * seal per sweep would be a column of near-identical transactions that
 * makes the real revisions harder to find, not easier.
 */

export const SEAL_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type SealAction =
  /** No seal yet today: read the claims and commit them. */
  | { kind: 'create' }
  /**
   * Today's seal exists but never reached the chain.
   *
   * Anchor that one rather than sealing again. A new seal would leave the
   * earlier document stranded with no proof of its time, and would date
   * today's claims to whenever the retry happened — so a run of failed
   * anchors would quietly erase a day from the record.
   */
  | { kind: 'anchor'; hash: string }
  | { kind: 'skip'; nextDueAt: string };

export function sealAction(
  latest: { hash: string; sealedAt: string; anchored: boolean } | null,
  now: Date,
): SealAction {
  if (!latest) return { kind: 'create' };
  if (!latest.anchored) return { kind: 'anchor', hash: latest.hash };

  const due = Date.parse(latest.sealedAt) + SEAL_INTERVAL_MS;
  /* An unparseable timestamp is treated as overdue rather than as a
     reason to stop sealing forever. */
  if (!Number.isFinite(due)) return { kind: 'create' };
  if (now.getTime() >= due) return { kind: 'create' };
  return { kind: 'skip', nextDueAt: new Date(due).toISOString() };
}
