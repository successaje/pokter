import { getAddress } from 'viem';

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
export const TEAM_WALLETS: readonly string[] = [
  '0x60eF148485C2a5119fa52CA13c52E9fd98F28e87',
  '0xEF869BB780a5163E6D39E83817cD29af6DEaA784',
  '0x3fb8779f4f42e1800F27AAec9564530BCaa852Bf',
  '0xcE515e144c33EDbD1c3320fde0dE6373315885eD',
].map((address) => getAddress(address));

/** Checksum-insensitive, and false for anything that is not an address. */
export function isTeamWallet(address: string): boolean {
  try {
    return TEAM_WALLETS.includes(getAddress(address));
  } catch {
    return false;
  }
}
