import { createClient, signerFromPrivateKey, BNB_TESTNET, erc8183Addresses, getErc8183Job } from '@altananetwork/sdk';
import { encodeFunctionData, getAddress } from 'viem';

// From @bnbagent/sdk networks/addresses.ts — the reference deployment manifest.
const CORRECT_POLICY = getAddress('0xd6a4217588f6b1f5657a92a3e94e6422ad771cea');

const a = erc8183Addresses(97);
console.log(`Altana SDK policy : ${a.policy}`);
console.log(`bnbagent policy   : ${CORRECT_POLICY}\n`);

const key = process.env.ALTANA_ADMIN_KEY as `0x${string}`;
const client = createClient({ chains: [BNB_TESTNET] });
const signer = signerFromPrivateKey(key);
const wallet = await client.createWallet({ signer });

const data = encodeFunctionData({
  abi: [{
    name: 'registerJob', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'policy', type: 'address' }],
    outputs: [],
  }],
  functionName: 'registerJob',
  args: [864n, CORRECT_POLICY],
});

console.log(`registerJob(864, ${CORRECT_POLICY}) on router ${a.router}`);
try {
  const result = await client.execute({ wallet, signer, calls: [{ to: a.router, data }] });
  console.log(`  ${result.status}  tx ${result.transactionHash ?? '—'}`);
} catch (error) {
  console.log(`  FAILED ${(error as Error).message.replace(/\s+/g, ' ').slice(0, 180)}`);
}

const job = await getErc8183Job(BNB_TESTNET, 864n);
console.log(`\njob #864: ${job.statusName}, budget ${job.budget}`);
