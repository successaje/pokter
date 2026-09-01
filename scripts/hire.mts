/**
 * Commission a real ERC-8183 job and follow it to completion.
 *
 *   npx tsx --env-file=.env.local scripts/hire.mts
 *
 * Defaults to a provider with a proven delivery record on BSC testnet, at the
 * 0.1 $U price its completed jobs were priced at.
 */
import { formatUnits } from 'viem';

import { hireAgent, refreshJob, paymentTokenBalance, settleJob } from '../src/lib/erc8183/hire.js';
import { altanaClient, adminSigner, ALTANA_NETWORK } from '../src/lib/altana/client.js';

const PROVIDER = (process.env.HIRE_PROVIDER ??
  '0xdA61DfA428Bb0B04AE6BfC6D3E5F65360592fD7E') as `0x${string}`;

const TASK =
  process.env.HIRE_TASK ??
  JSON.stringify({
    task: 'Rank current Venus supply yields for USDT on BNB Chain. Include net APY, and state any assumption you had to make.',
    requested_by: 'Pokter',
  });

const BUDGET = Number(process.env.HIRE_BUDGET ?? 0.1);

const wallet = await altanaClient().createWallet({ signer: adminSigner() });
const balance = await paymentTokenBalance(wallet.address);

console.log(`wallet  : ${wallet.address}`);
console.log(`network : chain ${ALTANA_NETWORK.chainId}`);
console.log(`balance : ${balance} $U`);
console.log(`provider: ${PROVIDER}`);
console.log(`budget  : ${BUDGET} $U\n`);

const job = await hireAgent({
  provider: PROVIDER,
  task: TASK,
  agentName: process.env.HIRE_AGENT_NAME ?? 'Testnet ERC-8183 seller',
  agentTokenId: process.env.HIRE_AGENT_TOKEN ?? 'testnet',
  budgetU: BUDGET,
});

console.log(`job #${job.jobId} FUNDED`);
console.log(`  budget  ${formatUnits(BigInt(job.budgetRaw), 18)} $U`);
console.log(`  expires ${job.expiredAt}`);
console.log(`  tx      ${ALTANA_NETWORK.explorer.replace(/\/$/, '')}/tx/${job.hireTxHash}\n`);

// Poll for delivery. The dispute window governs when settle becomes valid, so
// this only watches; it does not assume an outcome.
for (let attempt = 1; attempt <= 20; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 15_000));
  const current = await refreshJob(job.id);
  console.log(`  [${attempt}] status ${current.status}${current.deliverableUrl ? ` — ${current.deliverableUrl}` : ''}`);

  if (current.status === 'SUBMITTED' || current.status === 'COMPLETED') {
    if (current.deliverableUrl) console.log(`\ndeliverable: ${current.deliverableUrl}`);
    if (current.status === 'SUBMITTED') {
      console.log('\nDelivered. Escrow releases after the dispute window; run settle to approve early-exit if allowed.');
    }
    break;
  }
  if (current.status === 'EXPIRED' || current.status === 'REJECTED') {
    console.log(`\nended as ${current.status}`);
    break;
  }
}

if (process.env.HIRE_SETTLE === 'true') {
  const settled = await settleJob(job.id, 'approve');
  console.log(`\nsettle: ${settled.status} tx ${settled.settleTxHash}`);
}
