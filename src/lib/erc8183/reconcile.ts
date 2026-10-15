import 'server-only';

import { getErc8183Job } from '@altananetwork/sdk';

import { altanaNetworkFor } from '@/lib/altana/client';
import { indexIfMissing, jobIdentity } from '@/lib/erc8183/job-identity';
import { nextPending, parsePending, REVISIT_PER_RUN } from '@/lib/erc8183/reconcile-pending';
import { getJobStore } from '@/lib/erc8183/store';
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
const PENDING = (chainId: number) => `reconcile-pending:${chainId}`;

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
  const pendingBefore = parsePending(store.readCursor(PENDING(chainId)));
  const revisit = pendingBefore.slice(0, REVISIT_PER_RUN);
  const stillPending: number[] = [];
  const resolved: number[] = [];

  /*
   * One job: recover it if it is Pokter's and funded; keep it for another
   * look if it could not be read, or is Pokter's and not yet funded.
   */
  const visit = async (id: number) => {
    if (store.byId(`${chainId}:${id}`) || store.all().some((job) => job.chainId === chainId && job.jobId === String(id))) {
      resolved.push(id);
      return;
    }
    let onchain;
    try {
      onchain = await getErc8183Job(network, BigInt(id));
    } catch {
      stillPending.push(id);
      return;
    }
    scanned += 1;
    const identity = await jobIdentity(onchain.description, onchain.provider, chainId).catch(() => null);
    if (!identity) {
      resolved.push(id);
      return;
    }
    if (onchain.statusName === 'OPEN') {
      // Pokter's, created and not yet funded: look again next run.
      stillPending.push(id);
      return;
    }
    if (await indexIfMissing({ chainId, jobId: String(id), onchain })) recoveredIds.push(String(id));
    resolved.push(id);
  };

  for (const id of revisit) await visit(id);
  for (let id = from; id <= to; id += 1) await visit(id);

  // Old enough that any deadline has long passed: no longer worth a look.
  const oldestAllowed = Math.max(1, counter - 20_000);
  store.writeCursor(PENDING(chainId), JSON.stringify(nextPending(pendingBefore.filter((id) => !revisit.includes(id)), stillPending, resolved, oldestAllowed)));
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
