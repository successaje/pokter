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
export const TEAM_WALLETS: ReadonlyArray<{ address: `0x${string}`; label: string }> = [];

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
