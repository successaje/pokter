import { getAddress } from 'viem';

import { TEAM_WALLETS as DECLARED_TEAM_WALLETS } from '@/lib/team/wallets';

/**
 * Wallets Pokter controls, declared to BNB in docs/phase-2/tracking.md §5 and
 * excluded from quest counting there.
 *
 * Separate from the watcher that uses it so the rule can be tested: the
 * watcher is `server-only` and cannot be imported from a test, and a list
 * deciding what reaches a human is exactly the thing that should be pinned.
 *
 * A hire from one of these is us exercising our own product. Alerting on it
 * would teach whoever reads the alerts to stop reading them.
 */
export const TEAM_WALLETS: readonly string[] = DECLARED_TEAM_WALLETS.map(({ address }) => getAddress(address));

/** Checksum-insensitive, and false for anything that is not an address. */
export function isTeamWallet(address: string): boolean {
  try {
    return TEAM_WALLETS.includes(getAddress(address));
  } catch {
    return false;
  }
}
