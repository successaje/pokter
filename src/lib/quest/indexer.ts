import 'server-only';

import { createPublicClient, http, parseAbi, type Address } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { CAMPAIGN_STARTS_AT } from '@/lib/campaign/window';
import { getQuestStore, type EscrowJob } from './store';

/** BNB Chain's ERC-8183 escrow contracts, shared by every shortlisted marketplace. */
export const QUEST_CHAINS = {
  56: { chain: bsc, rpc: process.env.BSC_MAINNET_RPC_URL ?? 'https://bsc-rpc.publicnode.com', commerce: '0xEa4DAa3100A767e86FDed867729ae7446476EBA6' as Address },
  97: { chain: bscTestnet, rpc: 'https://bsc-testnet-rpc.publicnode.com', commerce: '0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE' as Address },
} as const;
export type QuestChainId = keyof typeof QUEST_CHAINS;

export const COMMERCE_ABI = parseAbi([
  'function jobCounter() view returns (uint256)',
  'function getJob(uint256) view returns ((uint256 id, address client, address provider, address evaluator, string description, uint256 budget, uint256 expiredAt, uint8 status, address hook, uint256 submittedAt, bytes32 deliverable))',
]);
export const JOB_STATUS = ['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'] as const;

const BATCH = 100;
const CAMPAIGN_START = Math.floor(CAMPAIGN_STARTS_AT.getTime() / 1000);

export function questClient(chainId: QuestChainId) {
  const { chain, rpc } = QUEST_CHAINS[chainId];
  return createPublicClient({ chain, transport: http(rpc), batch: { multicall: true } });
}
type Client = ReturnType<typeof questClient>;

function readJob(client: Client, chainId: QuestChainId, id: bigint) {
  return client.readContract({ address: QUEST_CHAINS[chainId].commerce, abi: COMMERCE_ABI, functionName: 'getJob', args: [id] });
}

/**
 * The first job whose deadline falls after the campaign opened.
 *
 * The contract keeps a job's deadline, not its creation time, so this is
 * where the window starts: a hire made shortly before 1 October with a
 * deadline after it is included. Deadlines rise with job ids closely enough
 * for a binary search.
 */
async function firstCampaignJob(client: Client, chainId: QuestChainId, counter: bigint): Promise<bigint> {
  let low = 1n;
  let high = counter + 1n;
  while (low < high) {
    const mid = (low + high) / 2n;
    if ((await readJob(client, chainId, mid)).expiredAt < BigInt(CAMPAIGN_START)) low = mid + 1n;
    else high = mid;
  }
  return low;
}

/**
 * Index new jobs by id from where the cursor stands, a bounded number per
 * run, reading current state, which any node serves. A failed batch stops
 * the run with the cursor before it, so nothing is skipped.
 */
export async function indexEscrowJobs(
  chainId: QuestChainId,
  { maxBatches = 20 }: { maxBatches?: number } = {},
): Promise<{ chainId: number; indexed: number; nextJob: number; counter: number; caughtUp: boolean }> {
  const store = getQuestStore();
  const client = questClient(chainId);
  const counter = await client.readContract({ address: QUEST_CHAINS[chainId].commerce, abi: COMMERCE_ABI, functionName: 'jobCounter' });
  const existing = store.cursor(chainId);
  const first = existing ? BigInt(existing.firstJob) : await firstCampaignJob(client, chainId, counter);
  let next = existing ? BigInt(existing.nextJob) : first;
  let indexed = 0;
  for (let batch = 0; batch < maxBatches && next <= counter; batch += 1) {
    const ids: bigint[] = [];
    for (let id = next; id <= counter && ids.length < BATCH; id += 1n) ids.push(id);
    const jobs = await Promise.all(ids.map((id) => readJob(client, chainId, id)));
    const rows: EscrowJob[] = jobs
      .filter((j) => j.expiredAt >= BigInt(CAMPAIGN_START))
      .map((j) => ({
        chainId,
        jobId: Number(j.id),
        client: j.client,
        provider: j.provider,
        budget: j.budget.toString(),
        expiredAt: Number(j.expiredAt),
        status: j.status,
        description: j.description.slice(0, 4000),
      }));
    next = ids[ids.length - 1] + 1n;
    store.advance(chainId, rows, Number(first), Number(next));
    indexed += rows.length;
  }
  if (!existing && indexed === 0) store.advance(chainId, [], Number(first), Number(next));
  return { chainId, indexed, nextJob: Number(next), counter: Number(counter), caughtUp: next > counter };
}

const IDENTITY = {
  56: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  97: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
} as const satisfies Record<QuestChainId, Address>;
const IDENTITY_ABI = parseAbi(['function getAgentWallet(uint256) view returns (address)']);

/**
 * Read the registered wallet of each listed agent from the ERC-8004
 * identity registry and cache it, so a paid wallet can be matched to the
 * agent it belongs to. Batched; failures leave the previous value.
 */
export async function refreshAgentWallets(agents: Array<{ chainId: number; tokenId: string; name: string | null }>): Promise<number> {
  const store = getQuestStore();
  let saved = 0;
  for (const chainId of [56, 97] as const) {
    const client = questClient(chainId);
    const mine = agents.filter((a) => a.chainId === chainId && /^\d+$/.test(a.tokenId));
    for (let i = 0; i < mine.length; i += BATCH) {
      const batch = mine.slice(i, i + BATCH);
      const wallets = await Promise.all(
        batch.map((a) => client.readContract({ address: IDENTITY[chainId], abi: IDENTITY_ABI, functionName: 'getAgentWallet', args: [BigInt(a.tokenId)] }).catch(() => null)),
      );
      const rows = batch
        .map((a, j) => ({ ...a, wallet: wallets[j] }))
        .filter((r): r is typeof r & { wallet: Address } => Boolean(r.wallet) && r.wallet !== '0x0000000000000000000000000000000000000000');
      store.saveAgentWallets(rows);
      saved += rows.length;
    }
  }
  return saved;
}
