import { erc8183Addresses } from '@altananetwork/sdk';
import { createPublicClient, fallback, getAddress, http, type Address } from 'viem';

import { publicReadUrls } from '../src/lib/chain/transport';
import { CUSTODY_CHAINS, escrowCustody, registryCustody, type ContractCustody } from '../src/lib/erc8183/custody';
import { POLICY_OVERRIDES } from '../src/lib/erc8183/policy-override';

/**
 * Holds the published custody disclosure against the chain.
 *
 * The risk disclosure and the terms tell buyers the escrow's code can be
 * replaced, and the developers page names who can replace it. That is a claim
 * about live state, and it can go wrong in two directions that both matter: an
 * admin that has changed makes the pages point at the wrong party, and an admin
 * that has been given up — renounced, or a proxy replaced by something with no
 * upgrade path — makes them overstate a risk that no longer exists.
 *
 * Out of `npm run verify` on purpose: that does no network I/O, and a public
 * RPC having a bad minute is not a reason to fail a release.
 */

const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const EMPTY_SLOT = `0x${'0'.repeat(64)}`;
const OWNER_ABI = [
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const;

const clients = new Map<number, ReturnType<typeof createPublicClient>>();
function client(chainId: number) {
  const existing = clients.get(chainId);
  if (existing) return existing;
  const made = createPublicClient({ transport: fallback(publicReadUrls(chainId).map((url) => http(url))) });
  clients.set(chainId, made);
  return made;
}

/** The implementation an ERC-1967 proxy delegates to, or null when the slot is empty and the address is therefore not one. */
async function implementation(chainId: number, address: Address): Promise<Address | null> {
  const word = await client(chainId).getStorageAt({ address, slot: IMPLEMENTATION_SLOT });
  return word && word !== EMPTY_SLOT ? getAddress(`0x${word.slice(26)}`) : null;
}

/** `owner()`, or null when the contract has none. A revert is the answer, not a failure. */
async function owner(chainId: number, address: Address): Promise<Address | null> {
  try {
    return getAddress(await client(chainId).readContract({ address, abi: OWNER_ABI, functionName: 'owner' }));
  } catch {
    return null;
  }
}

async function check(chainId: number, declared: ContractCustody): Promise<string[]> {
  const address = getAddress(declared.address);
  const [impl, live] = await Promise.all([implementation(chainId, address), owner(chainId, address)]);
  const where = `${chainId} ${declared.name} ${address}`;

  if (declared.admin === null) {
    return [
      ...(impl ? [`${where}: declared not upgradeable, but it is a proxy over ${impl}`] : []),
      ...(live ? [`${where}: declared to have no owner, but owner() is ${live}`] : []),
    ];
  }
  return [
    ...(impl ? [] : [`${where}: declared a proxy, but its implementation slot is empty`]),
    ...(live === null ? [`${where}: declared admin ${declared.admin}, but owner() does not answer`] : []),
    ...(live && live !== declared.admin ? [`${where}: declared admin ${declared.admin}, chain says ${live}`] : []),
  ];
}

/* The same table the pages render: the SDK's, with the one policy value we pin. */
function governed(chainId: number) {
  const addresses = erc8183Addresses(chainId);
  const policy = POLICY_OVERRIDES[chainId];
  return policy ? { ...addresses, policy } : addresses;
}

const problems = (
  await Promise.all(
    CUSTODY_CHAINS.flatMap((chainId) => {
      const addresses = governed(chainId);
      return [...escrowCustody(chainId, addresses), registryCustody(chainId, addresses)].map((c) => check(chainId, c));
    }),
  )
).flat();

if (problems.length > 0) {
  console.error('Published custody no longer matches the chain:');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('\nFix src/lib/erc8183/custody.ts, and the risk and terms copy it supports, before the next release.');
  process.exit(1);
}

console.log(`Custody disclosure matches the chain on ${CUSTODY_CHAINS.join(' and ')}.`);
