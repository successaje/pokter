/**
 * Settle job #1353 once its dispute window closes.
 *
 * Inlines the client rather than importing src/lib, which is `server-only`
 * and therefore needs the react-server condition that altana-sdk#88 makes
 * unresolvable. Same reason as scripts/prove-enforcement.mts.
 */
import {
  createClient,
  signerFromPrivateKey,
  settleErc8183Job,
  getErc8183Job,
  erc8183Addresses,
  BNB_TESTNET,
} from '@altananetwork/sdk';
import { createPublicClient, http, getAddress } from 'viem';
import { bscTestnet } from 'viem/chains';

const JOB = 1353n;
const POLL_SECONDS = 30;

const publicClient = createPublicClient({ chain: bscTestnet, transport: http() });
const policyAbi = [
  { name: 'disputeWindow', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

async function settleableAt(): Promise<number> {
  const job = await getErc8183Job(BNB_TESTNET, JOB);
  const window = await publicClient.readContract({
    address: getAddress(erc8183Addresses(97).policy as string),
    abi: policyAbi,
    functionName: 'disputeWindow',
  });
  return Number(job.submittedAt) + Number(window);
}

const opensAt = await settleableAt();
for (;;) {
  const now = Math.floor(Date.now() / 1000);
  if (now >= opensAt) break;
  console.log(`  waiting ${opensAt - now}s for the dispute window to close`);
  await new Promise((r) => setTimeout(r, POLL_SECONDS * 1000));
}

const signer = signerFromPrivateKey(process.env.ALTANA_ADMIN_KEY as `0x${string}`);
const client = createClient({ chains: [BNB_TESTNET] });
const wallet = await client.createWallet({ signer });

console.log(`  window closed; settling as ${wallet.address}`);
const result = await settleErc8183Job(
  { address: wallet.address },
  signer,
  { jobId: JOB, action: 'approve' },
  { network: BNB_TESTNET },
);
console.log('  settle tx :', result.transactionHash ?? '(none reported)');

const after = await getErc8183Job(BNB_TESTNET, JOB);
console.log('  job status:', after.statusName);
