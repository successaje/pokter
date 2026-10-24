import 'server-only';

import { getAddress, pad, parseAbiItem, toHex, type Hex } from 'viem';

import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { getJobStore } from '@/lib/erc8183/store';
import type { HiredJob } from '@/lib/erc8183/types';
import { isEscrowChain } from '@/lib/network/escrow';
import { historyClient } from '@/lib/erc8183/history-client';
import { REGISTRY_ABI, registryAddress } from '@/lib/registry/onchain';
import { fundedRecently, ownerAtFunding, ownerCandidate, type OwnershipReader } from './owner-at-job';

const MAX_PER_RUN = 10;
const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)');

/*
 * Every read here is of the past: the funding's receipt, the owner at an
 * earlier block, transfers since. Public mainnet nodes refuse all three, so
 * a mainnet job could never be attributed; they go through the history
 * client (NodeReal first, see `chain/rpc.ts`).
 */

/** The proof's reads, against the agent's own registry chain. Null when Pokter has no registry or RPC for it. */
function registryReader(chainId: number, tokenId: string): OwnershipReader | null {
  const address = registryAddress(chainId);
  if ((chainId !== 56 && chainId !== 97) || !address || !/^\d+$/.test(tokenId)) return null;
  const client = historyClient(chainId);
  const token = BigInt(tokenId);
  return {
    latestBlock: () => client.getBlockNumber(),
    blockTimeMs: async (block) => Number((await client.getBlock({ blockNumber: block })).timestamp) * 1000,
    ownerAt: async (block) => {
      const owner = await client.readContract({ address, abi: REGISTRY_ABI, functionName: 'ownerOf', args: [token], blockNumber: block }).catch(() => null);
      return owner ? getAddress(owner) : null;
    },
    transfers: async (from, to) => (await client.getLogs({ address, event: TRANSFER, args: { tokenId: token }, fromBlock: from, toBlock: to })).length,
  };
}

/**
 * Record who owned the agent for one job, if its funding is recent enough
 * to say (see owner-at-job.ts). Returns whether an owner was recorded.
 *
 * Every failure is a skip, not a guess: an unreadable block or registry
 * leaves the job for the next run, and the window closing on it leaves it
 * unattributed for good.
 */
export async function attributeJob(job: HiredJob, nowMs = Date.now()): Promise<boolean> {
  const store = getJobStore();
  if (!isEscrowChain(job.chainId) || !ownerCandidate(job, store.ownerAt(job.id) !== null, nowMs)) return false;
  const rpc = historyClient(job.chainId === 56 ? 56 : 97);
  const receipt = await rpc.getTransactionReceipt({ hash: job.hireTxHash as Hex }).catch(() => null);
  if (!receipt || receipt.status !== 'success') return false;
  // The transaction must be this job's own, from the escrow, not any recent hash.
  const commerce = getAddress(correctedErc8183Addresses(job.chainId).commerce);
  const topic = pad(toHex(BigInt(job.jobId)), { size: 32 }).toLowerCase();
  if (!receipt.logs.some((log) => getAddress(log.address) === commerce && log.topics[1]?.toLowerCase() === topic)) return false;
  const block = await rpc.getBlock({ blockNumber: receipt.blockNumber }).catch(() => null);
  if (!block) return false;
  const fundedAtMs = Number(block.timestamp) * 1000;
  if (!fundedRecently(fundedAtMs, nowMs)) return false;
  const registryChain = job.agentChainId ?? 56;
  const reader = registryReader(registryChain, job.agentTokenId);
  if (!reader) return false;
  // Proven, not read: the owner now, with no transfer of the agent since the funding (owner-at-job.ts).
  const owner = await ownerAtFunding(reader, { fundedAtMs, ...(registryChain === job.chainId ? { fromBlock: receipt.blockNumber } : {}) }).catch(() => undefined);
  if (owner === undefined) return false; // unreadable: tried again while the funding is recent
  if (owner === null) {
    store.markOwnerUnknown(job.id);
    return false;
  }
  store.recordOwnerAt({ id: job.id, owner, fundedAt: new Date(fundedAtMs).toISOString(), proof: 'no-transfer-since-funding' });
  return true;
}

/**
 * Rows the first version recorded by reading the owner alone, without the
 * proof. They are not shown until proven the same way, from the funding
 * time they kept; a transfer since then, or a funding too long ago to
 * check, leaves the job unattributed.
 */
export async function proveLegacyOwners(): Promise<{ proven: number; dropped: number }> {
  const store = getJobStore();
  let proven = 0;
  let dropped = 0;
  for (const row of store.unprovenOwners().slice(0, MAX_PER_RUN)) {
    const job = store.byId(row.id);
    const reader = job ? registryReader(job.agentChainId ?? 56, job.agentTokenId) : null;
    if (!job || !reader) continue;
    const owner = await ownerAtFunding(reader, { fundedAtMs: Date.parse(row.fundedAt) }, 40).catch(() => undefined);
    if (owner === undefined) continue;
    if (owner !== null && owner.toLowerCase() === row.owner.toLowerCase()) {
      store.proveOwner(row.id, 'no-transfer-since-funding');
      proven += 1;
    } else {
      store.dropOwner(row.id);
      dropped += 1;
    }
  }
  return { proven, dropped };
}

/** The sweep's pass: recently funded jobs nobody has attributed yet. */
export async function attributeRecentJobs(nowMs = Date.now()): Promise<{ attributed: number; checked: number }> {
  const store = getJobStore();
  const due = store
    .all()
    .filter((job) => ownerCandidate(job, store.ownerAt(job.id) !== null, nowMs))
    .slice(0, MAX_PER_RUN);
  let attributed = 0;
  for (const job of due) if (await attributeJob(job, nowMs)) attributed += 1;
  const legacy = await proveLegacyOwners().catch(() => ({ proven: 0, dropped: 0 }));
  return { attributed, checked: due.length, ...legacy };
}
