/**
 * Whether the sweep should tell a seller about a funded job.
 *
 * Pure, so the timing can be tested without a chain. The hire page tells
 * the seller straight after funding; the sweep is the backstop for a buyer
 * who closed the tab first, and for a seller that could not be reached.
 * A seller's own answer, accept or refuse, is final: asking again would
 * not change it.
 */
export const NOTICE_GRACE_MS = 2 * 60_000;
export const NOTICE_RETRY_MS = 15 * 60_000;
export const NOTICE_MAX_ATTEMPTS = 3;

export function noticeDue(
  job: { hiredAtMs: number; expiresAtMs: number },
  notice: { status: 'accepted' | 'rejected' | 'unreachable'; attempts: number; lastAtMs: number } | null,
  now: number,
): boolean {
  if (job.expiresAtMs <= now) return false;
  if (!notice) return now - job.hiredAtMs >= NOTICE_GRACE_MS;
  if (notice.status !== 'unreachable') return false;
  return notice.attempts < NOTICE_MAX_ATTEMPTS && now - notice.lastAtMs >= NOTICE_RETRY_MS;
}
