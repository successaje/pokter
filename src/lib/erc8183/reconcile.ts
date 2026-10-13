import 'server-only';

import { getAddress } from 'viem';
import { getErc8183Job } from '@altananetwork/sdk';

import { altanaNetworkFor } from '@/lib/altana/client';
import { decodePokterJobEnvelope } from '@/lib/erc8183/job-envelope';
import { getJobStore } from '@/lib/erc8183/store';
import type { HiredJob } from '@/lib/erc8183/types';
import { scanRange } from '@/lib/erc8183/reconcile-window';
import { enabledEscrowChains, type EscrowChainId } from '@/lib/network/escrow';

/**
 * Find the jobs Pokter brokered by reading the escrow, not by being told.
 *
 * The index was written from the browser: after a hire landed, the page
 * posted the job id back. That works until it doesn't. A hire funded
 * through `wallet_sendCalls` often returns a calls id and no receipt
 * hash, and the client skipped indexing and warned to a console nobody
 * reads — so mainnet job 56980 sat funded on chain while Pokter's own
 * public API reported no mainnet jobs at all. A tab closed at the wrong
 * moment does the same thing.
 *
 * The chain already knows. Every job Pokter brokers carries a
 * `pokter-job` envelope in its own on-chain description, so the set is
 * recoverable from the escrow with no cooperation from any browser. That
 * is also what makes Pokter's published counts checkable by a stranger,
 * which is the point of keeping them.
 *
 * Bounded on purpose. Mainnet's counter is past 56,000 and walking all of
 * it on a schedule would be a denial-of-service against a public node for
 * no gain. Each chain keeps a cursor; the first run starts one window
 * back from the counter and later runs scan only what is new.
 */

const CURSOR = (chainId: number) => `reconcile:${chainId}`;

export interface ReconcileOutcome {
  chainId: number;
  /** Jobs read from the escrow this pass. */
  scanned: number;
  /** Jobs that carried a Pokter envelope and were not already indexed. */
  recovered: number;
  /** Job ids recovered, so a run says what it did rather than only how much. */
  recoveredIds: string[];
  from: number;
  to: number;
}

function toHiredJob(
  chainId: EscrowChainId,
  jobId: bigint,
  onchain: Awaited<ReturnType<typeof getErc8183Job>>,
  envelope: NonNullable<ReturnType<typeof decodePokterJobEnvelope>>,
): HiredJob {
  const now = new Date().toISOString();
  return {
    id: `${chainId}:${jobId}`,
    jobId: jobId.toString(),
    chainId,
    isTestnet: chainId === 97,
    agentChainId: envelope.identity.chainId,
    agentTokenId: envelope.identity.tokenId,
    agentName: envelope.identity.name ?? `Agent #${envelope.identity.tokenId}`,
    providerLabel: envelope.providerLabel,
    client: onchain.client,
    provider: onchain.provider,
    task: envelope.task,
    budgetRaw: onchain.budget.toString(),
    expiredAt: new Date(Number(onchain.expiredAt) * 1000).toISOString(),
    /*
     * The chain does not record when a job was created, only when it
     * expires, so a recovered row is stamped now. It is the one field a
     * reconciled job cannot report truthfully, and dating it to the scan
     * is better than inventing a creation time from the expiry.
     */
    hiredAt: now,
    hireTxHash: null,
    status: onchain.statusName,
    statusCheckedAt: now,
    deliverableUrl: null,
    settleTxHash: null,
    disputeTxHash: null,
  };
}

async function reconcileChain(chainId: EscrowChainId): Promise<ReconcileOutcome> {
  const store = getJobStore();
  const network = altanaNetworkFor(chainId);

  /*
   * The counter is read by asking for a job that cannot exist and letting
   * the SDK fail, so this needs no second ABI. A chain that will not
   * answer returns an empty pass rather than throwing a sweep away.
   */
  const counter = await readJobCounter(chainId);
  if (counter === null) {
    return { chainId, scanned: 0, recovered: 0, recoveredIds: [], from: 0, to: 0 };
  }

  const { from, to } = scanRange(counter, store.readCursor(CURSOR(chainId)));
  if (from > counter) {
    return { chainId, scanned: 0, recovered: 0, recoveredIds: [], from, to: counter };
  }

  const recoveredIds: string[] = [];
  let scanned = 0;

  for (let id = from; id <= to; id += 1) {
    if (store.byId(`${chainId}:${id}`)) continue;
    let onchain;
    try {
      onchain = await getErc8183Job(network, BigInt(id));
    } catch {
      /* One unreadable job must not stop the pass; the cursor still moves
         past it, and a later run will not revisit it. */
      continue;
    }
    scanned += 1;
    if (onchain.statusName === 'OPEN') continue;

    const envelope = decodePokterJobEnvelope(onchain.description);
    if (!envelope) continue;
    /* The same check the client-facing route makes: an envelope naming a
       provider the job does not pay is somebody else's job wearing our
       label. */
    try {
      if (getAddress(envelope.provider) !== getAddress(onchain.provider)) continue;
    } catch {
      continue;
    }

    store.record(toHiredJob(chainId, BigInt(id), onchain, envelope));
    recoveredIds.push(String(id));
  }

  store.writeCursor(CURSOR(chainId), String(to));
  return { chainId, scanned, recovered: recoveredIds.length, recoveredIds, from, to };
}

/**
 * The job counter, or null when the escrow will not say.
 *
 * Read through the same SDK the rest of the escrow path uses rather than
 * a hand-rolled `eth_call`, so a deployment change moves one import.
 */
async function readJobCounter(chainId: EscrowChainId): Promise<number | null> {
  const { createPublicClient, http, parseAbi } = await import('viem');
  const { bsc, bscTestnet } = await import('viem/chains');
  const { correctedErc8183Addresses } = await import('@/lib/erc8183/addresses');
  try {
    const client = createPublicClient({
      chain: chainId === 56 ? bsc : bscTestnet,
      transport: http(altanaNetworkFor(chainId).publicRpcUrl),
    });
    const counter = await client.readContract({
      address: correctedErc8183Addresses(chainId).commerce as `0x${string}`,
      abi: parseAbi(['function jobCounter() view returns (uint256)']),
      functionName: 'jobCounter',
    });
    return Number(counter);
  } catch {
    return null;
  }
}

/** Reconcile every escrow Pokter funds hires on. */
export async function reconcileJobIndex(): Promise<ReconcileOutcome[]> {
  const chains = enabledEscrowChains();
  const outcomes: ReconcileOutcome[] = [];
  for (const chainId of chains) {
    outcomes.push(await reconcileChain(chainId));
  }
  return outcomes;
}
