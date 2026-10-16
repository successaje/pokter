/**
 * Pull named expired escrows back to the wallet that funded them.
 *
 *   JOBS=1500,1501 npx tsx --env-file=.env.local scripts/reclaim.mts
 *   DRY=1 …                           simulate only, send nothing
 *
 * Why a script and not `/api/jobs/reclaim`: that route needs a running
 * server and SWEEP_SECRET, and its guards live behind `server-only`, which
 * plain tsx cannot import (altana-sdk#88). This mirrors `reclaimJob`'s
 * guards directly and signs with the same admin key.
 *
 * Named ids only, never "everything expired". That rule is the reclaim
 * route's, and it is worth keeping: a reclaim is a transaction against real
 * escrow, and a loop over every expired job is the kind of convenience
 * that eventually sends one it should not have.
 */
import { buildClaimRefundCall, getErc8183Job, BNB, BNB_TESTNET } from '@altananetwork/sdk';
import { createPublicClient, createWalletClient, formatUnits, getAddress, http } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const chainId = Number(process.env.CHAIN ?? 97);
if (chainId !== 56 && chainId !== 97) throw new Error('CHAIN must be 56 or 97.');
const jobs = (process.env.JOBS ?? '').split(',').map((id) => id.trim()).filter(Boolean);
if (jobs.length === 0) throw new Error('Name the jobs: JOBS=1500,1501');
if (!jobs.every((id) => /^\d{1,12}$/.test(id))) throw new Error('Job ids must be numeric.');
const dry = process.env.DRY === '1';

const key = process.env.ALTANA_ADMIN_KEY;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key.trim())) throw new Error('ALTANA_ADMIN_KEY is not set, or is not a 32-byte hex key.');
const account = privateKeyToAccount(key.trim() as `0x${string}`);

const chain = chainId === 56 ? bsc : bscTestnet;
const network = chainId === 56 ? BNB : BNB_TESTNET;
const read = createPublicClient({ chain, transport: http() });
const send = createWalletClient({ account, chain, transport: http() });

console.log(`wallet : ${account.address}`);
console.log(`chain  : ${chainId}${dry ? '  (dry run — nothing will be sent)' : ''}\n`);

let reclaimed = 0;
for (const jobId of jobs) {
  const job = await getErc8183Job(network, BigInt(jobId));
  const budget = formatUnits(job.budget, 18);
  const expiresAt = Number(job.expiredAt) * 1000;
  const label = `#${jobId}`.padEnd(6);

  /* The same four refusals `reclaimJob` makes, said the same way. */
  if (getAddress(job.client) !== account.address) {
    console.log(`${label} skipped: funded by ${job.client}, not this wallet`);
    continue;
  }
  if (job.statusName !== 'FUNDED' && job.statusName !== 'EXPIRED') {
    console.log(`${label} skipped: ${job.statusName.toLowerCase()}, so there is no escrow left to reclaim`);
    continue;
  }
  if (expiresAt > Date.now()) {
    console.log(`${label} skipped: expires ${new Date(expiresAt).toISOString()}, the agent still has time to deliver`);
    continue;
  }

  const call = buildClaimRefundCall(chainId, BigInt(jobId));
  /*
   * Simulated first. A reverting call is what produces the gas-limit error
   * MetaMask shows buyers; here it would just be a wasted transaction fee
   * on a call that was never going to work.
   */
  try {
    await read.call({ account: account.address, to: call.to, data: call.data as `0x${string}` });
  } catch (error) {
    const text = (error as Error).message;
    console.log(`${label} refused by the escrow: ${text.match(/0x[0-9a-f]{8}\b/i)?.[0] ?? text.split('\n')[0]}`);
    continue;
  }

  if (dry) {
    console.log(`${label} would reclaim ${budget} $U`);
    continue;
  }
  const hash = await send.sendTransaction({ to: call.to, data: call.data as `0x${string}` });
  const receipt = await read.waitForTransactionReceipt({ hash });
  const after = await getErc8183Job(network, BigInt(jobId));
  console.log(`${label} reclaimed ${budget} $U · ${receipt.status} · now ${after.statusName} · ${hash}`);
  if (receipt.status === 'success') reclaimed += 1;
}

console.log(`\n${dry ? 'simulated' : 'reclaimed'} ${dry ? jobs.length : reclaimed} of ${jobs.length} named job(s)`);
