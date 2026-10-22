/**
 * When a buyer should hear that a delivered job's payment can, or must, be
 * released.
 *
 * Under the escrow's optimistic policy a delivered job can be settled only
 * after its review window closes (7 days on mainnet), and only until the
 * job's deadline, about a day later. Nothing settles it by itself: a job
 * nobody releases in that gap expires, the escrow returns to the buyer and
 * the agent is not paid for work it did. Job 56:56997 was lost that way on
 * 22 October, delivered and released by nobody.
 *
 * So a subscribed buyer hears twice: when release opens, and again a few
 * hours before the deadline if it still has not happened. A window that
 * opens with less than that left sends only the second.
 */
export const RELEASE_CLOSING_NOTICE_MS = 4 * 3_600_000;

export type ReleaseReminder = 'RELEASE_OPEN' | 'RELEASE_CLOSING';

export function releaseReminderDue(input: { status: string; submittedAt: number; disputeWindowSeconds: number; expiredAt: number; now: number }): { event: ReleaseReminder; opensAt: number; closesAt: number } | null {
  if (input.status !== 'SUBMITTED' || input.submittedAt <= 0) return null;
  const opensAt = (input.submittedAt + input.disputeWindowSeconds) * 1000;
  const closesAt = input.expiredAt * 1000;
  if (input.now < opensAt || input.now >= closesAt) return null;
  const event: ReleaseReminder = closesAt - input.now <= RELEASE_CLOSING_NOTICE_MS ? 'RELEASE_CLOSING' : 'RELEASE_OPEN';
  return { event, opensAt, closesAt };
}
