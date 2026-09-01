import { createClient, signerFromPrivateKey, BNB_TESTNET, erc8183Addresses, buildHireCalls, getErc8183Job } from '@altananetwork/sdk';
import { parseUnits } from 'viem';

const key = process.env.ALTANA_ADMIN_KEY as `0x${string}`;
const addresses = erc8183Addresses(97);
const client = createClient({ chains: [BNB_TESTNET] });
const signer = signerFromPrivateKey(key);
const wallet = await client.createWallet({ signer });

const before = await getErc8183Job(BNB_TESTNET, 864n);
console.log(`job #864 before: ${before.statusName}, budget ${before.budget}`);

// Rebuild the batch for job 864 and drop the registerJob call (index 1), which
// this deployment rejects and which completed jobs never used.
const all = buildHireCalls({
  addresses,
  jobId: 864n,
  provider: before.provider,
  description: before.description,
  budget: parseUnits('0.1', 18),
  expiredAt: before.expiredAt,
});

const calls = [all[2], all[3], all[4]]; // setBudget, approve $U, fund
console.log(`executing ${calls.length} calls: setBudget, approve, fund\n`);

try {
  const result = await client.execute({ wallet, signer, calls });
  console.log(`  ${result.status}  tx ${result.transactionHash ?? '—'}`);
} catch (error) {
  console.log(`  FAILED ${(error as Error).message.replace(/\s+/g, ' ').slice(0, 220)}`);
}

const after = await getErc8183Job(BNB_TESTNET, 864n);
console.log(`\njob #864 after: ${after.statusName}, budget ${after.budget}`);
