/**
 * Whether a job can still be submitted.
 *
 * The escrow policy only accepts a submission while its whole dispute
 * window still fits before the deadline: 7 days on mainnet, 15 minutes on
 * testnet. Past that, `submit` reverts with 0x15e5dd74. Checked before the
 * work is done, so the agent neither burns gas on a revert nor tells the
 * buyer it delivered when it could not.
 */
export const SUBMIT_MARGIN_SECONDS = 120;

export function submitWindowProblem(input: { expiredAt: number; now: number; disputeWindowSeconds: number }): string | null {
  const remaining = input.expiredAt - input.now;
  if (remaining >= input.disputeWindowSeconds + SUBMIT_MARGIN_SECONDS) return null;
  const days = input.disputeWindowSeconds / 86_400;
  const window = days >= 1 ? `${Math.round(days)} days` : `${Math.round(input.disputeWindowSeconds / 60)} minutes`;
  return `This job's deadline is too close to submit: the escrow needs its review window of ${window} to fit before the deadline. The buyer can reclaim the escrow once it passes.`;
}
