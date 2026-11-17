import 'server-only';

import { createPublicClient, parseAbi, type Address } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { CAMPAIGN_STARTS_AT } from '@/lib/campaign/window';
import { readTransport } from '@/lib/chain/rpc';
import { publicReadUrls } from '@/lib/chain/transport';
import { getQuestStore, type EscrowJob } from './store';

/**
 * BNB Chain's ERC-8183 escrow contracts. Marketplaces that settle through their own contracts are not read.
 *
 * Read through several public nodes, not one: the escrow index, agent
 * wallets, wallet activity and the tracker's lookup all go through this client,
 * and every read here is of the present, which any of them serves.
 */
export const QUEST_CHAINS = {
  56: { chain: bsc, rpcs: publicReadUrls(56, process.env.BSC_MAINNET_RPC_URL), commerce: '0xEa4DAa3100A767e86FDed867729ae7446476EBA6' as Address },
  97: { chain: bscTestnet, rpcs: publicReadUrls(97), commerce: '0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE' as Address },
} as const;
export type QuestChainId = keyof typeof QUEST_CHAINS;

export const COMMERCE_ABI = parseAbi([
  'function jobCounter() view returns (uint256)',
  'function getJob(uint256) view returns ((uint256 id, address client, address provider, address evaluator, string description, uint256 budget, uint256 expiredAt, uint8 status, address hook, uint256 submittedAt, bytes32 deliverable))',
  'function jobPaymentToken(uint256) view returns (address)',
]);
export const JOB_STATUS = ['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'] as const;

const BATCH = 100;
const CAMPAIGN_START = Math.floor(CAMPAIGN_STARTS_AT.getTime() / 1000);

export function questClient(chainId: QuestChainId) {
  const { chain, rpcs } = QUEST_CHAINS[chainId];
  return createPublicClient({ chain, transport: readTransport(chainId, rpcs), batch: { multicall: true } });
}
type Client = ReturnType<typeof questClient>;
/** What the index reads through; a test passes its own. */
export type Reader = Pick<Client, 'readContract'>;

function readJob(client: Reader, chainId: QuestChainId, id: bigint) {
  return client.readContract({ address: QUEST_CHAINS[chainId].commerce, abi: COMMERCE_ABI, functionName: 'getJob', args: [id] });
}

/*
 * The token a job is paid in. Recorded so a row is never read as $U by
 * default; a failed read is stored as null (unknown) and does not stop the
 * batch, since the token is shown, not summed.
 */
function readPaymentToken(client: Reader, chainId: QuestChainId, id: bigint): Promise<string | null> {
  return client
    .readContract({ address: QUEST_CHAINS[chainId].commerce, abi: COMMERCE_ABI, functionName: 'jobPaymentToken', args: [id] })
    .then((token) => (/^0x0{40}$/i.test(token as string) ? null : (token as string)))
    .catch(() => null);
}

/**
 * The first job whose deadline falls after the campaign opened.
 *
 * The contract keeps a job's deadline, not its creation time, so this is
 * where the window starts: a hire made shortly before 1 October with a
 * deadline after it is included. Deadlines rise with job ids closely enough
 * for a binary search.
 */
async function firstCampaignJob(client: Reader, chainId: QuestChainId, counter: bigint): Promise<bigint> {
  let low = 1n;
  let high = counter + 1n;
  while (low < high) {
    const mid = (low + high) / 2n;
    if ((await readJob(client, chainId, mid)).expiredAt < BigInt(CAMPAIGN_START)) low = mid + 1n;
    else high = mid;
  }
  return low;
}

/** A batch of jobs by id, with their payment tokens, as rows. */
async function readRows(client: Reader, chainId: QuestChainId, ids: bigint[]): Promise<EscrowJob[]> {
  const jobs = await Promise.all(ids.map((id) => readJob(client, chainId, id)));
  const tokens = await Promise.all(jobs.map((j) => readPaymentToken(client, chainId, j.id)));
  return jobs.map((j, i) => ({
    chainId,
    jobId: Number(j.id),
    client: j.client,
    provider: j.provider,
    budget: j.budget.toString(),
    expiredAt: Number(j.expiredAt),
    status: j.status,
    description: j.description.slice(0, 4000),
    paymentToken: tokens[i],
    submittedAt: Number(j.submittedAt),
  }));
}

/**
 * Index new jobs by id from where the cursor stands, a bounded number per
 * run, reading current state, which any node serves. A failed batch stops
 * the run with the cursor before it, so nothing is skipped.
 *
 * Every job is kept: agents' records read the whole index, and the
 * campaign tracker applies its own window (`inCampaignWindow`).
 */
export async function indexEscrowJobs(
  chainId: QuestChainId,
  { maxBatches = 20, client = questClient(chainId) }: { maxBatches?: number; client?: Reader } = {},
): Promise<{ chainId: number; indexed: number; nextJob: number; counter: number; caughtUp: boolean }> {
  const store = getQuestStore();
  const counter = await client.readContract({ address: QUEST_CHAINS[chainId].commerce, abi: COMMERCE_ABI, functionName: 'jobCounter' });
  const existing = store.cursor(chainId);
  const first = existing ? BigInt(existing.firstJob) : await firstCampaignJob(client, chainId, counter);
  let next = existing ? BigInt(existing.nextJob) : first;
  let indexed = 0;
  for (let batch = 0; batch < maxBatches && next <= counter; batch += 1) {
    const ids: bigint[] = [];
    for (let id = next; id <= counter && ids.length < BATCH; id += 1n) ids.push(id);
    const rows = await readRows(client, chainId, ids);
    next = ids[ids.length - 1] + 1n;
    store.advance(chainId, rows, Number(first), Number(next));
    indexed += rows.length;
  }
  if (!existing && indexed === 0) store.advance(chainId, [], Number(first), Number(next));
  return { chainId, indexed, nextJob: Number(next), counter: Number(counter), caughtUp: next > counter };
}

/**
 * Read the jobs before the index's first one, newest first, until job 1.
 *
 * A new index starts at the campaign's first job, and an agent's record
 * needs every job before it too. Walking down from there leaves the forward
 * index free to keep up with new jobs while the history fills in, which on
 * mainnet is tens of thousands of jobs. Bounded by batches and by a
 * deadline, and a failed batch leaves the cursor where it was.
 */
export async function backfillEscrowJobs(
  chainId: QuestChainId,
  { maxBatches = 20, deadlineAt = Number.POSITIVE_INFINITY, client = questClient(chainId), now = Date.now }: { maxBatches?: number; deadlineAt?: number; client?: Reader; now?: () => number } = {},
): Promise<{ chainId: number; indexed: number; firstJob: number | null; complete: boolean }> {
  const store = getQuestStore();
  const cursor = store.cursor(chainId);
  /* Nothing to extend until the forward index has started. */
  if (!cursor) return { chainId, indexed: 0, firstJob: null, complete: false };
  let first = BigInt(cursor.firstJob);
  let indexed = 0;
  for (let batch = 0; batch < maxBatches && first > 1n && now() < deadlineAt; batch += 1) {
    const ids: bigint[] = [];
    for (let id = first - 1n; id >= 1n && ids.length < BATCH; id -= 1n) ids.push(id);
    const rows = await readRows(client, chainId, ids);
    first = ids[ids.length - 1];
    store.extendBack(chainId, rows, Number(first));
    indexed += rows.length;
  }
  return { chainId, indexed, firstJob: Number(first), complete: first <= 1n };
}

/** How long a job that can still move goes between reads. */
export const ESCROW_STATUS_FRESH_MS = 60 * 60_000;
const REFRESH_LIMIT = 300;

/**
 * Read again the jobs of agent wallets whose status can still change.
 *
 * A stored row is the job as it stood when indexed, and a job indexed as
 * open may since have been given its budget and provider, funded,
 * delivered and paid. Only agents' jobs, and jobs with no provider yet,
 * are re-read, at most hourly each and least recently read first
 * (`jobsToRefresh` says which can still move). Status, delivery time,
 * budget and provider are all taken from the read, and the token when it
 * was never read. A failed read leaves the row for the next pass.
 */
export async function refreshEscrowStatuses(
  { deadlineAt = Number.POSITIVE_INFINITY, clients = { 56: questClient(56), 97: questClient(97) }, now = Date.now }:
  { deadlineAt?: number; clients?: Record<QuestChainId, Reader>; now?: () => number } = {},
): Promise<{ read: number; changed: number; failed: number }> {
  const store = getQuestStore();
  const due = store.jobsToRefresh({ readBefore: new Date(now() - ESCROW_STATUS_FRESH_MS).toISOString(), limit: REFRESH_LIMIT });
  let read = 0;
  let changed = 0;
  let failed = 0;
  for (let i = 0; i < due.length && now() < deadlineAt; i += BATCH) {
    const batch = due.slice(i, i + BATCH).filter((job) => job.chainId in QUEST_CHAINS);
    const reads = await Promise.all(batch.map((job) => readJob(clients[job.chainId as QuestChainId], job.chainId as QuestChainId, BigInt(job.jobId)).catch(() => null)));
    /* Only where it is missing: a job's token is fixed when it is created. */
    const tokens = await Promise.all(batch.map((job) => (job.paymentToken ? null : readPaymentToken(clients[job.chainId as QuestChainId], job.chainId as QuestChainId, BigInt(job.jobId)))));
    const fresh = batch.flatMap((job, k) => {
      const onChain = reads[k];
      if (!onChain) return [];
      if (onChain.status !== job.status) changed += 1;
      return [{
        chainId: job.chainId, jobId: job.jobId, status: onChain.status, submittedAt: Number(onChain.submittedAt),
        budget: onChain.budget.toString(), provider: onChain.provider, paymentToken: tokens[k],
      }];
    });
    store.saveReads(fresh, new Date(now()).toISOString());
    read += fresh.length;
    failed += batch.length - fresh.length;
  }
  return { read, changed, failed };
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
