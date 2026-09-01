import { erc8183Addresses, BNB_TESTNET } from '@altananetwork/sdk';
import { createPublicClient, http } from 'viem';

const a = erc8183Addresses(97);
const rpc = createPublicClient({ chain: BNB_TESTNET.chain, transport: http(BNB_TESTNET.publicRpcUrl) });

const NAMES = ['disputeWindow', 'DISPUTE_WINDOW', 'window', 'minExpiry', 'minDuration', 'gracePeriod'];

for (const [target, label] of [
  [a.policy, 'policy'],
  [a.router, 'router'],
  [a.commerce, 'commerce'],
] as const) {
  for (const fn of NAMES) {
    try {
      const value = await rpc.readContract({
        address: target,
        abi: [{ type: 'function', name: fn, stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
        functionName: fn,
      });
      console.log(`${label}.${fn} = ${value}s (${Number(value) / 3600}h)`);
    } catch {
      /* absent */
    }
  }
}

// What does an existing, working job look like? Compare its window to ours.
const { getErc8183Job } = await import('@altananetwork/sdk');
for (const id of [852n, 853n, 858n]) {
  const job = await getErc8183Job(BNB_TESTNET, id);
  const span = Number(job.expiredAt) - Number(job.submittedAt || 0n);
  console.log(
    `job #${job.id} ${job.statusName} expiredAt ${job.expiredAt} submittedAt ${job.submittedAt} span ${span}s`,
  );
}
