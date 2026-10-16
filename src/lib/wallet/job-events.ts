import { canSettle, type SettleTiming } from '@/lib/erc8183/settle-window';

/**
 * Events a job warrants that are not a change of status.
 *
 * The buyer's inbox records one note per status transition, keyed by that
 * status. A review window opening is not a transition — the job stays
 * SUBMITTED from delivery until someone settles it — so the moment a buyer
 * can act was the one moment nothing told them about.
 *
 * It cannot come from a sweep either. The window is 15 minutes on testnet
 * (the policy's `disputeWindow` is 900s) against a two-hour sweep, so a
 * swept notice would arrive after the window it was announcing had closed.
 * It is derived instead, from timings the job page already reads, and
 * recorded once when the time passes.
 *
 * The rule is `canSettle` rather than a second copy of it: a buyer must
 * never be told to release a job the escrow would refuse.
 */

export type DerivedJobEvent = 'release-available';

export function releaseAvailable(input: SettleTiming & { status: string; disputed?: boolean }): boolean {
  if (input.status !== 'SUBMITTED') return false;
  // A dispute is its own path, with its own actors and deadlines.
  if (input.disputed) return false;
  if (input.submittedAt <= 0) return false;
  return canSettle('approve', input).allowed;
}

export const DERIVED_EVENT_COPY: Record<DerivedJobEvent, { title: string; body: (jobId: string, agentName: string) => string }> = {
  'release-available': {
    title: 'Payment can be released',
    body: (jobId, agentName) =>
      `The review window on job #${jobId} has closed, so the payment to ${agentName} can now be released — by you or by anyone. It can no longer be disputed.`,
  },
};
