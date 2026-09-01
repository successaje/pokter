import { createClient, signerFromPrivateKey, BNB_TESTNET, erc8183Addresses, buildHireCalls, getErc8183Job } from '@altananetwork/sdk';
import { parseUnits } from 'viem';

const a = erc8183Addresses(97);
const key = process.env.ALTANA_ADMIN_KEY as `0x${string}`;
const client = createClient({ chains: [BNB_TESTNET] });
const signer = signerFromPrivateKey(key);
const wallet = await client.createWallet({ signer });
const job = await getErc8183Job(BNB_TESTNET, 864n);

const all = buildHireCalls({
  addresses: a, jobId: 864n, provider: job.provider,
  description: job.description, budget: parseUnits('0.1', 18), expiredAt: job.expiredAt,
});

console.log('funding job #864 (policy already registered)…');
try {
  const result = await client.execute({ wallet, signer, calls: [all[4]] });
  console.log(`  ${result.status}  tx ${result.transactionHash ?? '—'}`);
} catch (error) {
  console.log(`  FAILED ${(error as Error).message.replace(/\s+/g, ' ').slice(0, 180)}`);
}

const after = await getErc8183Job(BNB_TESTNET, 864n);
console.log(`\njob #864: ${after.statusName}, budget ${after.budget}, provider ${after.provider}`);
