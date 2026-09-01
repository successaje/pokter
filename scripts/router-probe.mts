import { erc8183Addresses, BNB_TESTNET } from '@altananetwork/sdk';
import { createPublicClient, http } from 'viem';

const a = erc8183Addresses(97);
const rpc = createPublicClient({ chain: BNB_TESTNET.chain, transport: http(BNB_TESTNET.publicRpcUrl) });

console.log(`router ${a.router}`);
console.log(`policy (per SDK) ${a.policy}\n`);

const uintToAddr = (fn: string) => [{
  type: 'function', name: fn, stateMutability: 'view',
  inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }],
}] as const;

// What policy did known-good jobs register?
for (const fn of ['jobPolicy', 'policies', 'policyOf', 'policyFor', 'getPolicy']) {
  for (const jobId of [852n, 853n, 858n, 864n]) {
    try {
      const value = await rpc.readContract({
        address: a.router, abi: uintToAddr(fn), functionName: fn, args: [jobId],
      });
      console.log(`router.${fn}(${jobId}) = ${value}`);
    } catch {
      /* absent */
    }
  }
}

// Is there an allowlist of acceptable policies?
for (const fn of ['allowedPolicy', 'isPolicy', 'approvedPolicy', 'registeredPolicy']) {
  try {
    const value = await rpc.readContract({
      address: a.router,
      abi: [{ type: 'function', name: fn, stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] }],
      functionName: fn, args: [a.policy],
    });
    console.log(`router.${fn}(${a.policy}) = ${value}`);
  } catch {
    /* absent */
  }
}

// Does the policy contract agree it is the right one?
for (const fn of ['router', 'commerce', 'owner']) {
  try {
    const value = await rpc.readContract({
      address: a.policy,
      abi: [{ type: 'function', name: fn, stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
      functionName: fn,
    });
    console.log(`policy.${fn} = ${value}`);
  } catch {
    /* absent */
  }
}
