import { createClient, signerFromPrivateKey, BNB_TESTNET, erc8183Addresses, getErc8183Job } from '@altananetwork/sdk';
import { encodeFunctionData, toFunctionSelector } from 'viem';

const a = erc8183Addresses(97);
const key = process.env.ALTANA_ADMIN_KEY as `0x${string}`;
const client = createClient({ chains: [BNB_TESTNET] });
const signer = signerFromPrivateKey(key);
const wallet = await client.createWallet({ signer });

console.log(`registerJob(uint256)          selector ${toFunctionSelector('function registerJob(uint256)')}`);
console.log(`registerJob(uint256,address)  selector ${toFunctionSelector('function registerJob(uint256,address)')}  <- SDK uses this\n`);

const data = encodeFunctionData({
  abi: [{ name: 'registerJob', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'jobId', type: 'uint256' }], outputs: [] }],
  functionName: 'registerJob',
  args: [864n],
});

for (const [label, target] of [['router', a.router], ['commerce', a.commerce]] as const) {
  console.log(`trying registerJob(864) on ${label} ${target}`);
  try {
    const result = await client.execute({ wallet, signer, calls: [{ to: target, data }] });
    console.log(`  ${result.status}  tx ${result.transactionHash ?? '—'}`);
    break;
  } catch (error) {
    console.log(`  FAILED ${(error as Error).message.replace(/\s+/g, ' ').slice(0, 140)}`);
    await new Promise((r) => setTimeout(r, 15_000));
  }
}

const job = await getErc8183Job(BNB_TESTNET, 864n);
console.log(`\njob #864: ${job.statusName}, budget ${job.budget}`);
