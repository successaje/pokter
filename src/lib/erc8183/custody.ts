import { getAddress, type Address } from 'viem';

import type { EscrowChainId } from '../network/escrow';

/**
 * Who can change the contracts that hold a funded job, and who cannot.
 *
 * Pokter tells buyers the escrow decides the outcome and that Pokter cannot
 * override it. Both are true, and together they read as "the rules are fixed".
 * They are not: the escrow and the evaluator router are ERC-1967 proxies, so
 * the address that holds the money stays the same while the logic governing it
 * can be replaced. The storage behind that address — the job records and the
 * token balance — survives the replacement, which is what makes this a
 * disclosure rather than a footnote: new code governs jobs that were funded
 * under the old code.
 *
 * This is what the risk disclosure and the developers page render. It is here
 * rather than written into either page so the two cannot drift, and so one
 * check can hold it against the chain. Addresses are passed in rather than read
 * here: `addresses.ts` imports `@altananetwork/sdk`, which publishes no entry
 * point a test or a script can resolve, and this table is worth testing.
 *
 * Every field was read from chain, mainnet values from two independent RPCs.
 * `npm run audit:custody` re-reads them; it is deliberately out of `npm run
 * verify`, which does no network I/O. To check one by hand:
 *
 *   cast storage <address> 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
 *   cast call <address> 'owner()(address)'
 *
 * A populated implementation slot is a proxy; a zero admin slot with a
 * reverting `proxiableUUID()` through the proxy is UUPS, so the upgrade is
 * authorised by the implementation rather than by a separate admin. On the
 * escrow that authorisation is ownership: `upgradeToAndCall` from any other
 * sender reverts `OwnableUnauthorizedAccount`.
 *
 * Deliberately absent: how many signatures each admin requires. It is a Safe,
 * it publishes its own threshold and signers, and either can change without
 * anything here changing. Copying them would publish a figure that goes stale
 * silently, which is the one thing this product must not do. The pages link to
 * the admin instead.
 */
export type ContractCustody = {
  /** The label the developers page already uses for this contract. */
  readonly name: string;
  readonly address: string;
  /**
   * The address that can replace this contract's code, or null when nothing
   * can: no proxy, no owner, no admin.
   */
  readonly admin: Address | null;
};

/** The subset of a deployment's addresses whose custody is stated here. */
export type GovernedAddresses = {
  readonly commerce: string;
  readonly router: string;
  readonly policy: string;
  readonly registry: string;
};

/*
 * Read 26 November 2026. The two escrow chains have the same shape and
 * different admins; mainnet's escrow and testnet's are separate deployments
 * under separate keys, so neither says anything about the other. On mainnet the
 * registry is under a different key again — agent identity and the escrow are
 * not governed by the same party, and a page that implied they were would be
 * wrong about both.
 */
const ADMINS: Record<EscrowChainId, { escrow: Address; registry: Address }> = {
  56: {
    escrow: getAddress('0x5057b09a4b510ccaf7e3fb3038ba60713e62b1fc'),
    registry: getAddress('0xf223968dd0c66472e31043acacccf5d1464d644b'),
  },
  97: {
    escrow: getAddress('0x1611e27be13feb93242bf57914872ea63f9e64dc'),
    registry: getAddress('0x1611e27be13feb93242bf57914872ea63f9e64dc'),
  },
};

/**
 * Every chain this file states custody for.
 *
 * The check reads these rather than the chains this process has escrow enabled
 * on: the table is published whether or not a given deployment renders it, and
 * a claim about mainnet going stale while a developer runs with testnet only
 * is exactly the case worth catching.
 */
export const CUSTODY_CHAINS = [56, 97] as const satisfies readonly EscrowChainId[];

/**
 * The three escrow contracts a hire depends on, in the order a reader meets
 * them: the commerce contract holds the funds, the router sends a dispute to a
 * policy, and the policy decides it. Only the first two share an admin; the
 * policy has none at all.
 */
export function escrowCustody(chainId: EscrowChainId, addresses: GovernedAddresses): ContractCustody[] {
  const { escrow } = ADMINS[chainId];
  return [
    { name: 'ERC-8183 commerce', address: addresses.commerce, admin: escrow },
    { name: 'Evaluator router', address: addresses.router, admin: escrow },
    { name: 'Optimistic policy', address: addresses.policy, admin: null },
  ];
}

/** The ERC-8004 registry Pokter reads identity from: a proxy too, and on mainnet under a different key than the escrow. */
export function registryCustody(chainId: EscrowChainId, addresses: GovernedAddresses): ContractCustody {
  return { name: 'ERC-8004 registry', address: addresses.registry, admin: ADMINS[chainId].registry };
}
