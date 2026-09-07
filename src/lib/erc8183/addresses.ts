import { erc8183Addresses } from '@altananetwork/sdk';
import { getAddress, type Address } from 'viem';

/**
 * ERC-8183 deployment addresses, with a guard we no longer need.
 *
 * `@altananetwork/sdk@0.8.0` shipped a stale OptimisticPolicy address for BSC
 * testnet. Registering a job against it reverted `0xc94463e3` on the
 * EvaluatorRouter — `PolicyNotWhitelisted()` — which then made `fund` revert
 * `0x32d53d69`, since an unregistered job cannot be funded. We found the
 * correct value by diffing against the reference `@bnbagent/sdk` and pinned it
 * here for chain 97 only.
 *
 * **Fixed upstream in 0.9.0**, released 2 September 2026, which now returns the
 * same address this table does. We are on 0.9.0 and the override is inert:
 * `hasPolicyOverride` reports false because nothing diverges any more.
 *
 * It stays rather than being deleted, because it is cheap and it is the kind of
 * defect that recurs — a table of addresses maintained by hand against
 * deployments maintained separately. If the two ever disagree again, this
 * catches it instead of surfacing as an undecodable revert.
 */
const POLICY_OVERRIDES: Record<number, Address> = {
  97: getAddress('0xd6a4217588f6b1f5657a92a3e94e6422ad771cea'),
};

export function correctedErc8183Addresses(chainId: number) {
  const addresses = erc8183Addresses(chainId);
  const policy = POLICY_OVERRIDES[chainId];
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
