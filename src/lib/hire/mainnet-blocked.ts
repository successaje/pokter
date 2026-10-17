/**
 * Whether Pokter already knows a mainnet hire of this agent cannot finish.
 *
 * A BNB Chain hire is funded against the agent's signed quote, so an agent
 * Pokter could not get a usable quote from (and not just at one busy
 * moment) leads only to a hire that stops at the quote. Its panel says so
 * instead of offering the purchase.
 */
export function mainnetHireBlocked(profile: { escrow: { chainId: number }; hireBlocker: { transient?: boolean } | null }): boolean {
  return profile.escrow.chainId === 56 && profile.hireBlocker !== null && !profile.hireBlocker.transient;
}
