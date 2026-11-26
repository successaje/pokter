import { getAddress, type Address } from 'viem';

/**
 * ERC-8183 OptimisticPolicy addresses we pin, against the SDK's own table.
 *
 * `@altananetwork/sdk@0.8.0` shipped a stale value for BSC testnet.
 * Registering a job against it reverted `0xc94463e3` on the EvaluatorRouter —
 * `PolicyNotWhitelisted()` — which then made `fund` revert `0x32d53d69`, since
 * an unregistered job cannot be funded. We found the correct value by diffing
 * against the reference `@bnbagent/sdk` and pinned it here for chain 97 only.
 *
 * **Fixed upstream in 0.9.0**, released 2 September 2026, which now returns the
 * same address this table does. We are on 0.9.0 and the override is inert:
 * `hasPolicyOverride` reports false because nothing diverges any more.
 *
 * It stays rather than being deleted, because it is cheap and it is the kind of
 * defect that recurs — a table of addresses maintained by hand against
 * deployments maintained separately. If the two ever disagree again, this
 * catches it instead of surfacing as an undecodable revert.
 *
 * It sits apart from `addresses.ts` so that a script or a test can read it.
 * `addresses.ts` imports `@altananetwork/sdk`, which publishes no entry point
 * the test runner or `tsx` can resolve from a `.ts` module, so anything that
 * module touches is reachable only from the running app.
 */
export const POLICY_OVERRIDES: Record<number, Address> = {
  97: getAddress('0xd6a4217588f6b1f5657a92a3e94e6422ad771cea'),
};
