import { createClient, signerFromPrivateKey, BNB_TESTNET, erc8183Addresses, buildHireCalls, getErc8183Job } from '@altananetwork/sdk';
import { parseUnits } from 'viem';

const key = process.env.ALTANA_ADMIN_KEY as `0x${string}`;
const addresses = erc8183Addresses(97);
const client = createClient({ chains: [BNB_TESTNET] });
const signer = signerFromPrivateKey(key);
const wallet = await client.createWallet({ signer });
const job = await getErc8183Job(BNB_TESTNET, 864n);

const all = buildHireCalls({
  addresses, jobId: 864n, provider: job.provider,
  description: job.description, budget: parseUnits('0.1', 18), expiredAt: job.expiredAt,
});

const steps = [
  { label: 'setBudget ', call: all[2] },
  { label: 'approve $U', call: all[3] },
  { label: 'fund      ', call: all[4] },
];

for (const [index, step] of steps.entries()) {
  if (index > 0) await new Promise((r) => setTimeout(r, 20_000));
  process.stdout.write(`${step.label} -> ${step.call.to.slice(0, 10)}… `);
  try {
    const result = await client.execute({ wallet, signer, calls: [step.call] });
    console.log(`${result.status} tx ${result.transactionHash ?? '—'}`);
  } catch (error) {
    console.log(`FAILED ${(error as Error).message.replace(/\s+/g, ' ').slice(0, 150)}`);
  }
}

const after = await getErc8183Job(BNB_TESTNET, 864n);
console.log(`\njob #864: ${after.statusName}, budget ${after.budget}`);
