import { erc8183Addresses } from '@altananetwork/sdk';
import { getAddress, type Address } from 'viem';

/**
 * Corrected ERC-8183 deployment addresses.
 *
 * `@altananetwork/sdk@0.8.0` ships a stale OptimisticPolicy address for BSC
 * testnet. Registering a job against it reverts `0xc94463e3` on the
 * EvaluatorRouter, which then makes `fund` revert `0x32d53d69` — an
 * unregistered job cannot be funded.
 *
 * The correct address is the one in the reference implementation,
 * `@bnbagent/sdk` (`src/networks/addresses.ts`). Mainnet agrees between the two
 * SDKs; only chain 97 diverges, so the override is scoped to it rather than
 * replacing the whole table.
 *
 * Verified by registering and funding job #864 on chain 97 with the corrected
 * address after the SDK's own value had failed repeatedly.
 */
const POLICY_OVERRIDES: Record<number, Address> = {
  97: getAddress('0xd6a4217588f6b1f5657a92a3e94e6422ad771cea'),
};

export function correctedErc8183Addresses(chainId: number) {
  const addresses = erc8183Addresses(chainId);
  const policy = POLICY_OVERRIDES[chainId];
  return policy ? { ...addresses, policy } : addresses;
}

/** True when we are deliberately diverging from the SDK for this chain. */
export function hasPolicyOverride(chainId: number): boolean {
  return chainId in POLICY_OVERRIDES;
}
