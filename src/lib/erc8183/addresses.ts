import { erc8183Addresses } from '@altananetwork/sdk';
import type { Address } from 'viem';

import { POLICY_OVERRIDES } from './policy-override';

/**
 * ERC-8183 deployment addresses, with the one policy value we pin.
 *
 * The override table and the reason it exists live in `policy-override.ts`,
 * which is free of the SDK so a script can read it.
 */
export function correctedErc8183Addresses(chainId: number) {
  const addresses = erc8183Addresses(chainId);
  const policy: Address | undefined = POLICY_OVERRIDES[chainId];
  return policy ? { ...addresses, policy } : addresses;
}

/**
 * True only when our value actually differs from the SDK's.
 *
 * Previously this returned true whenever an entry existed, which since 0.9.0
 * would claim we are diverging when we agree — and the interface uses this to
 * tell the user we are deliberately departing from the SDK. Saying that when it
 * is no longer true is exactly the kind of stale claim this product exists to
 * avoid.
 */
export function hasPolicyOverride(chainId: number): boolean {
  const override = POLICY_OVERRIDES[chainId];
  if (!override) return false;
  return erc8183Addresses(chainId).policy.toLowerCase() !== override.toLowerCase();
}

/** The ERC-8183 commerce contract for a chain: the escrow that holds its jobs. */
export function escrowCommerceAddress(chainId: number): string {
  return correctedErc8183Addresses(chainId).commerce;
}
