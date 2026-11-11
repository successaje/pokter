import 'server-only';

import { courierPaidTest } from '@/lib/erc8183/courier-paid';
import { deliverableKey, readDeliverable } from '@/lib/erc8183/deliverables';
import { outsideBuyerJobs, summariseEconomicHistory, type AgentEconomicHistory } from '@/lib/erc8183/economic-history';
import { getJobStore } from '@/lib/erc8183/store';
import type { HiredJob } from '@/lib/erc8183/types';
import { registeredWalletRead } from '@/lib/registry/live-agent';
import { teamAddressSet } from '@/lib/team/wallets';
import { carriesRelayedAnswerFor, readDeliveredManifest, type DeliveredManifest } from './delivery-kind';

/*
 * A delivered manifest never changes, so a job's classification is read once.
 * Jobs with no hosted manifest are the agent's own deliveries (it hosts them),
 * or not delivered at all: neither is a demonstration.
 */
const known = new Map<string, DeliveredManifest | null>();

/**
 * A job's hosted manifest, or null when there is none to read.
 *
 * Null is not "the agent delivered it": it is Pokter having nothing on
 * file, which happens for a delivery the agent hosts itself and for a job
 * that was never delivered. What to make of that is each caller's
 * decision, and the two make it in opposite directions — a manifest Pokter
 * cannot read is not a lifecycle demonstration, and it is not proof of a
 * carried answer either.
 */
function deliveredManifest(job: HiredJob): DeliveredManifest | null {
  if (job.status !== 'SUBMITTED' && job.status !== 'COMPLETED') return null;
  const key = `${job.chainId}:${job.jobId}`;
  const cached = known.get(key);
  if (cached !== undefined) return cached;
  const stored = readDeliverable(deliverableKey(job.chainId, job.jobId));
  const read = stored ? readDeliveredManifest(stored.manifestText) : null;
  known.set(key, read);
  return read;
}

export function isLifecycleDemo(job: HiredJob): boolean {
  return deliveredManifest(job)?.kind === 'lifecycle';
}

/**
 * Whether the delivery carried this agent's own answer to the escrow.
 *
 * The job is already attributed to an agent by Pokter's index, and the
 * manifest names the agent that answered: both have to say the same one.
 * See `carriesRelayedAnswerFor` for why the provider address cannot
 * answer this on its own.
 */
export function isRelayedDelivery(job: HiredJob): boolean {
  return carriesRelayedAnswerFor(deliveredManifest(job), {
    chainId: job.agentChainId,
    tokenId: job.agentTokenId,
  });
}

/**
 * An agent's record from its jobs, crediting only work the agent did.
 *
 * Every page and API that reports an agent's deliveries, acceptances,
 * misses or buyers reads it through this, so a lifecycle demonstration
 * Pokter's seller closed can never become the agent's accepted work on one
 * page while another calls it a demonstration.
 */
export function agentHistory(jobs: HiredJob[], now = Date.now()): AgentEconomicHistory {
  const store = getJobStore();
  return summariseEconomicHistory(jobs, now, {
    isLifecycleDemo,
    isRelayedDelivery,
    refusedAtNotice: (job) => store.noticeFor(job.chainId, job.jobId)?.status === 'rejected',
  });
}

export interface PaidWork {
  /** `agentHistory` over the jobs that paid, or would pay, the agent. */
  history: AgentEconomicHistory;
  /** Funded jobs the escrow paid to Pokter's courier instead, as `chainId:jobId`: in no figure of `history`. */
  courierJobs: string[];
  /** Jobs per outside buyer wallet, over the same jobs as `history` (`outsideBuyerJobs`). */
  outsideBuyers: Map<string, number>;
}

/**
 * The record behind every figure that calls itself the agent's paid work.
 *
 * Pokter's courier carries a brief to an agent that has signed no price
 * and submits the agent's answer, and the escrow pays the courier. The
 * agent answered and was not paid, so it is not the agent's paid work: a
 * mainnet profile counted a free testnet trial as one of its three paid
 * jobs while its hire page, counting one chain, said two. Which jobs those
 * are is the test /proof, the home page and the job page use
 * (`courierPaidTest`): a Pokter wallet as provider is the courier's unless
 * the registry names it as the agent's own.
 *
 * `agentHistory` keeps them, as deliveries Pokter made, because the ladder
 * and the readiness line say what a relayed delivery was.
 */
export async function agentPaidWork(jobs: HiredJob[], now = Date.now()): Promise<PaidWork> {
  const courierPaid = await courierPaidTest(jobs, teamAddressSet(), registeredWalletRead);
  const paid = jobs.filter((job) => !courierPaid(job));
  return {
    history: agentHistory(paid, now),
    courierJobs: jobs.filter((job) => job.status !== 'OPEN' && courierPaid(job) && !isLifecycleDemo(job)).map((job) => `${job.chainId}:${job.jobId}`),
    outsideBuyers: outsideBuyerJobs(paid, { isLifecycleDemo }),
  };
}
