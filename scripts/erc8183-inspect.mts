import { getErc8183Job, erc8183Addresses, BNB_TESTNET, JOB_STATUS } from '@altananetwork/sdk';
import { createPublicClient, http, formatUnits } from 'viem';

const client = createPublicClient({ chain: BNB_TESTNET.chain, transport: http(BNB_TESTNET.publicRpcUrl) });
const { commerce } = erc8183Addresses(97);

const counter = (await client.readContract({
  address: commerce,
  abi: [{ type: 'function', name: 'jobCounter', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
  functionName: 'jobCounter',
})) as bigint;

console.log(`testnet jobCounter: ${counter}\n`);
console.log('most recent jobs:\n');

const providers = new Map<string, number>();

for (let i = 0n; i < 12n && counter - i > 0n; i += 1n) {
  const jobId = counter - i;
  try {
    const job = await getErc8183Job(BNB_TESTNET, jobId);
    providers.set(job.provider, (providers.get(job.provider) ?? 0) + 1);
    console.log(
      `  #${String(job.id).padEnd(4)} ${job.statusName.padEnd(10)} ` +
        `budget ${formatUnits(job.budget, 18).padEnd(10)} U  provider ${job.provider}`,
    );
    console.log(`        "${job.description.slice(0, 84).replace(/\n/g, ' ')}"`);
  } catch (error) {
    console.log(`  #${jobId} read failed: ${(error as Error).message.slice(0, 60)}`);
  }
}

console.log('\nproviders seen (candidates to hire):');
for (const [provider, count] of [...providers.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${provider}  ${count} job(s)`);
}
console.log(`\nstatus enum: ${JOB_STATUS.join(', ')}`);
