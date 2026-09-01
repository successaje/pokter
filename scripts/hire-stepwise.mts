import {
  createClient, signerFromPrivateKey, BNB_TESTNET, erc8183Addresses, buildHireCalls,
} from '@altananetwork/sdk';
import { createPublicClient, http, parseUnits } from 'viem';

const key = process.env.ALTANA_ADMIN_KEY as `0x${string}`;
const addresses = erc8183Addresses(97);
const rpc = createPublicClient({ chain: BNB_TESTNET.chain, transport: http(BNB_TESTNET.publicRpcUrl) });

const client = createClient({ chains: [BNB_TESTNET] });
const signer = signerFromPrivateKey(key);
const wallet = await client.createWallet({ signer });

const [disputeWindow, jobCounter] = await Promise.all([
  rpc.readContract({
    address: addresses.policy,
    abi: [{ type: 'function', name: 'disputeWindow', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] }],
    functionName: 'disputeWindow',
  }),
  rpc.readContract({
    address: addresses.commerce,
    abi: [{ type: 'function', name: 'jobCounter', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
    functionName: 'jobCounter',
  }),
]);

const jobId = (jobCounter as bigint) + 1n;
const expiredAt = BigInt(Math.floor(Date.now() / 1000)) + BigInt(disputeWindow as bigint) + 1800n;

console.log(`wallet ${wallet.address}`);
console.log(`disputeWindow ${disputeWindow}s  predicted jobId ${jobId}`);
console.log(`expiredAt ${expiredAt} (${new Date(Number(expiredAt) * 1000).toISOString()})\n`);

const calls = buildHireCalls({
  addresses,
  jobId,
  provider: '0xdA61DfA428Bb0B04AE6BfC6D3E5F65360592fD7E',
  description: 'Pokter stepwise diagnostic: rank Venus USDT supply yields on BNB Chain.',
  budget: parseUnits('0.1', 18),
  expiredAt,
});

const LABELS = ['createJob', 'registerJob', 'setBudget', 'approve $U', 'fund'];

for (const [index, call] of calls.entries()) {
  process.stdout.write(`${index + 1}. ${LABELS[index].padEnd(12)} `);
  try {
    const result = await client.execute({ wallet, signer, calls: [call] });
    console.log(`${result.status}  tx ${result.transactionHash ?? '—'}`);
  } catch (error) {
    const raw = (error as Error).message.replace(/\s+/g, ' ').slice(0, 220);
    console.log(`FAILED\n     ${raw}`);
    console.log(`\nfailing call: ${LABELS[index]} -> ${call.to} selector ${call.data?.slice(0, 10)}`);
    break;
  }
}
