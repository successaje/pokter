import { getAddress } from 'viem';

/**
 * Wallets Pokter's own team has funded jobs from.
 *
 * Published so anyone can check them against the chain. Jobs these wallets
 * funded were tests of Pokter's own hire flow, not demand from buyers, so the
 * figures Pokter reports as marketplace activity leave them out and say how
 * many were left out. An agent's delivery record still counts them: a funded
 * job the agent let lapse is a fact about the agent, whoever paid for it.
 *
 * The operator key's address is added on the server (`teamWalletSet`), so it
 * cannot be forgotten here when the key changes.
 */
export const TEAM_WALLETS: ReadonlyArray<{ address: `0x${string}`; label: string }> = [
  { address: '0x60eF148485C2a5119fa52CA13c52E9fd98F28e87', label: 'Retired Pokter operator (kept for historical classification)' },
  { address: '0x93847647d7eb72a69E162117df6a8697dF53EDda', label: 'Pokter operator from 12 October 2026' },
  { address: '0xEF869BB780a5163E6D39E83817cD29af6DEaA784', label: 'Pokter team and payout wallet' },
  { address: '0x3fb8779f4f42e1800F27AAec9564530BCaa852Bf', label: 'Pokter team test wallet' },
  { address: '0xcE515e144c33EDbD1c3320fde0dE6373315885eD', label: 'Pokter team test wallet' },
];

function normalise(address: string): string | null {
  try {
    return getAddress(address).toLowerCase();
  } catch {
    return null;
  }
}

/** Lower-cased addresses, for membership checks. */
export function teamAddressSet(extra: readonly string[] = []): Set<string> {
  return new Set(
    [...TEAM_WALLETS.map((wallet) => wallet.address), ...extra]
      .map(normalise)
      .filter((address): address is string => address !== null),
  );
}

/**
 * Whether a job was funded by the team. A job with no recorded funder is one
 * of the operator-signed demo hires from before buyers signed their own, so it
 * is the team's too.
 */
export function fundedByTeam(job: { client?: string | null }, team: Set<string>): boolean {
  if (!job.client) return true;
  const client = normalise(job.client);
  return client === null || team.has(client);
}
