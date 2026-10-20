import 'server-only';

import { createPublicClient, getAddress, http, pad, toHex, type Hex } from 'viem';

import { altanaNetworkFor } from '@/lib/altana/client';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { getJobStore } from '@/lib/erc8183/store';
import type { HiredJob } from '@/lib/erc8183/types';
import { isEscrowChain } from '@/lib/network/escrow';
import { registryOwner } from '@/lib/registry/onchain';
import { fundedRecently, ownerCandidate } from './owner-at-job';

const MAX_PER_RUN = 10;

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
  const network = altanaNetworkFor(job.chainId);
  const rpc = createPublicClient({ chain: network.chain, transport: http(network.publicRpcUrl) });
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
  const owner = await registryOwner(job.agentChainId ?? 56, job.agentTokenId).catch(() => null);
  if (!owner) return false;
  store.recordOwnerAt({ id: job.id, owner, fundedAt: new Date(fundedAtMs).toISOString() });
  return true;
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
  return { attributed, checked: due.length };
}
