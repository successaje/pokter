import 'server-only';

import { getErc8183DeliverableUrl, getErc8183Job } from '@altananetwork/sdk';
import { createPublicClient, decodeFunctionData, getAddress, http, type Address } from 'viem';

import { altanaNetworkFor } from '@/lib/altana/client';
import { deliveryAnswered, pickAnsweredTasks, type AnsweredTask, type AnswerVerdict } from '@/lib/agent/answered-tasks';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { withPublicEndpoint } from '@/lib/proof/prober';
import { getQuestStore } from '@/lib/quest/store';

const PER_RUN = 10;
const RECHECK_PENDING_MS = 6 * 60 * 60 * 1000;
const MAX_BYTES = 256 * 1024;

function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise.catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

async function readDelivery(url: string): Promise<string | null> {
  return within(
    withPublicEndpoint(url, async (pinned) => {
      const response = await pinned.fetch({ headers: { accept: 'application/json, text/plain;q=0.9' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8_000) });
      if (!response.ok) return null;
      const text = await response.text();
      return new TextEncoder().encode(text).byteLength > MAX_BYTES ? null : text;
    }),
    10_000,
  );
}

const SUBMIT_ABI = [{ name: 'submit', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'deliverable', type: 'bytes32' }, { name: 'optParams', type: 'bytes' }], outputs: [] }] as const;
const GET_JOB_ABI = [{ name: 'getJob', type: 'function', stateMutability: 'view', inputs: [{ name: 'jobId', type: 'uint256' }], outputs: [{ type: 'tuple', components: [
  { name: 'id', type: 'uint256' }, { name: 'client', type: 'address' }, { name: 'provider', type: 'address' }, { name: 'evaluator', type: 'address' }, { name: 'description', type: 'string' }, { name: 'budget', type: 'uint256' }, { name: 'expiredAt', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'hook', type: 'address' }, { name: 'submittedAt', type: 'uint256' }, { name: 'deliverable', type: 'bytes32' }] }] }] as const;

/**
 * The deliverable URL from the submit transaction itself.
 *
 * The SDK finds it by searching event logs, and public nodes keep logs for
 * a short window only, so anything older than about a day came back
 * unreadable. The job records when it was submitted; the block at that time
 * is found by its timestamp, and its transactions (which full nodes keep)
 * hold the seller's `submit` call with the URL in its parameters.
 */
async function deliverableUrlFromSubmit(chainId: number, jobId: number): Promise<string | null> {
  const network = altanaNetworkFor(chainId);
  const client = createPublicClient({ chain: network.chain, transport: http(network.publicRpcUrl) });
  const commerce = getAddress(correctedErc8183Addresses(chainId).commerce) as Address;
  const job = await client.readContract({ address: commerce, abi: GET_JOB_ABI, functionName: 'getJob', args: [BigInt(jobId)] });
  const at = Number(job.submittedAt);
  if (!at) return null;
  const latest = await client.getBlock();
  let lo = 0n;
  let hi = latest.number;
  // Seconds per block is under 3 on both chains; start the search near the answer.
  const guess = latest.number - BigInt(Math.max(0, Math.floor((Number(latest.timestamp) - at) / 0.4)));
  lo = guess > 0n ? guess : 0n;
  while (lo > 0n && Number((await client.getBlock({ blockNumber: lo })).timestamp) > at) lo = lo > 200_000n ? lo - 200_000n : 0n;
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    if (Number((await client.getBlock({ blockNumber: mid })).timestamp) < at) lo = mid;
    else hi = mid;
  }
  for (let number = hi; number <= hi + 2n; number++) {
    const block = await client.getBlock({ blockNumber: number, includeTransactions: true });
    for (const tx of block.transactions) {
      if (!tx.to || getAddress(tx.to) !== commerce) continue;
      try {
        const call = decodeFunctionData({ abi: SUBMIT_ABI, data: tx.input });
        if (call.args[0] !== BigInt(jobId)) continue;
        const params = JSON.parse(Buffer.from(call.args[2].slice(2), 'hex').toString('utf8')) as Record<string, unknown>;
        const url = params.deliverable_url ?? params.url ?? params.uri;
        return typeof url === 'string' && /^https?:\/\//.test(url) ? url : null;
      } catch {
        /* Not this job's submit. */
      }
    }
  }
  return null;
}

/**
 * Decide, a few jobs per sweep, whether each delivered job held an answer.
 *
 * Bounded and cached because it reads other people's servers: a verdict is
 * stored once a job is delivered, refused or expired. A funded job, or a
 * delivery that could not be read, is looked at again every six hours.
 */
export async function checkAnsweredTasks({ budgetMs = 60_000 }: { budgetMs?: number } = {}): Promise<{ checked: number; answered: number }> {
  const store = getQuestStore();
  const jobs = store.jobsNeedingVerdict(PER_RUN, new Date(Date.now() - RECHECK_PENDING_MS).toISOString());
  // A share of the sweep's time, not all of it: what is left waits for the next run.
  const deadline = Date.now() + budgetMs;
  let answered = 0;
  let checked = 0;
  for (const job of jobs) {
    if (Date.now() > deadline) break;
    checked += 1;
    const network = altanaNetworkFor(job.chainId);
    const onchain = await within(getErc8183Job(network, BigInt(job.jobId)), 10_000);
    if (!onchain) continue;
    let verdict: AnswerVerdict;
    if (onchain.statusName === 'SUBMITTED' || onchain.statusName === 'COMPLETED') {
      const url =
        (await within(deliverableUrlFromSubmit(job.chainId, job.jobId), 20_000)) ??
        (await within(getErc8183DeliverableUrl(network, BigInt(job.jobId), { scanWindow: 5_000n, maxWindows: 300 }), 15_000));
      const text = url ? await readDelivery(url) : null;
      verdict = text ? deliveryAnswered(text) : 'unreadable';
    } else if (onchain.statusName === 'EXPIRED' || onchain.statusName === 'REJECTED') {
      verdict = 'unanswered';
    } else {
      verdict = 'pending';
    }
    store.saveTaskVerdict(job.chainId, job.jobId, verdict);
    if (verdict === 'answered') answered += 1;
  }
  return { checked, answered };
}

/**
 * Up to three wordings that returned an output in jobs paid to this
 * agent's wallet, for the hire page. Keyed by wallet: that is who the
 * escrow pays, and the page says so rather than "this agent".
 */
export function answeredTasksFor(agentWallet: string | null | undefined): AnsweredTask[] {
  if (!agentWallet) return [];
  try {
    const jobs = getQuestStore().byProviderWithVerdicts(agentWallet);
    return pickAnsweredTasks(jobs.map((job) => ({ jobId: job.jobId, chainId: job.chainId, description: job.description, verdict: job.verdict as AnswerVerdict | null })));
  } catch {
    return [];
  }
}
