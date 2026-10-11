import 'server-only';

import { privateKeyToAccount } from 'viem/accounts';

import { teamAddressSet } from './wallets';

/**
 * The operator key's address, derived rather than written down, so the team
 * list stays right when the key is rotated. Only the public address leaves
 * this function.
 */
export function operatorAddress(): `0x${string}` | null {
  const key = process.env.ALTANA_ADMIN_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) return null;
  try {
    return privateKeyToAccount(key as `0x${string}`).address;
  } catch {
    return null;
  }
}

/** Every team wallet: the published list plus the operator. */
export function teamWalletSet(): Set<string> {
  const operator = operatorAddress();
  return teamAddressSet(operator ? [operator] : []);
}

/** The published list plus the operator, for display. */
export function teamWalletList(): Array<{ address: string; label: string }> {
  const operator = operatorAddress();
  return [
    ...(operator ? [{ address: operator, label: 'Pokter operator key (demo and legacy hires)' }] : []),
    ...[...teamAddressSet()].filter((address) => address !== operator?.toLowerCase()).map((address) => ({ address, label: 'Pokter team' })),
  ];
}
