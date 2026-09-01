import { getErc8183Job, BNB_TESTNET, erc8183Addresses, createClient, signerFromPrivateKey } from '@altananetwork/sdk';
import { encodeFunctionData } from 'viem';

const job = await getErc8183Job(BNB_TESTNET, 864n);
console.log('job #864');
console.log(`  client     ${job.client}`);
console.log(`  provider   ${job.provider}`);
console.log(`  evaluator  ${job.evaluator}`);
console.log(`  hook       ${job.hook}`);
console.log(`  status     ${job.statusName}`);
console.log(`  budget     ${job.budget}`);
console.log(`  expiredAt  ${job.expiredAt}`);
console.log(`  desc       "${job.description.slice(0, 70)}"`);

if (process.env.TRY_REGISTER === 'true') {
  const addresses = erc8183Addresses(97);
  const key = process.env.ALTANA_ADMIN_KEY as `0x${string}`;
  const client = createClient({ chains: [BNB_TESTNET] });
  const signer = signerFromPrivateKey(key);
  const wallet = await client.createWallet({ signer });

  const data = encodeFunctionData({
    abi: [{ name: 'registerJob', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'policy', type: 'address' }], outputs: [] }],
    functionName: 'registerJob',
    args: [864n, addresses.policy],
  });

  console.log(`\nregisterJob(864, ${addresses.policy}) on router ${addresses.router}`);
  try {
    const result = await client.execute({ wallet, signer, calls: [{ to: addresses.router, data }] });
    console.log(`  ${result.status} tx ${result.transactionHash}`);
  } catch (error) {
    console.log(`  FAILED ${(error as Error).message.replace(/\s+/g, ' ').slice(0, 200)}`);
  }
}
