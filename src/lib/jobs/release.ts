/**
 * Whether a buyer may release a delivered job's payment from the page.
 *
 * While the escrow's review window is open the escrow refuses anyway, and
 * the receipt check is what a buyer leans on to decide. Once it has closed
 * with no dispute, the optimistic policy has accepted the delivery and anyone
 * may settle: requiring the check then protects nothing, and a check Pokter
 * cannot run (public nodes refuse logs a week old, as for job 56:57001) would
 * stop the buyer paying an agent the escrow has already decided to pay.
 * `reviewOpen` is null while the window has not been read, and then the
 * check is required.
 */
export function releaseAllowed(input: { reviewOpen: boolean | null; receiptVerified: boolean; disputed: boolean }): { allowed: boolean; reason: string | null } {
  if (input.disputed) return { allowed: true, reason: null };
  if (input.reviewOpen === true) return { allowed: false, reason: 'The escrow’s review window is still open.' };
  if (input.receiptVerified) return { allowed: true, reason: null };
  if (input.reviewOpen === false) return { allowed: true, reason: null };
  return { allowed: false, reason: 'Verify the receipt against its on-chain hash first.' };
}
