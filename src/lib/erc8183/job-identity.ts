import 'server-only';

import { getAddress } from 'viem';

import { decodePokterJobEnvelope, decodeReferenceJobDescription } from '@/lib/erc8183/job-envelope';
import { getJobStore } from '@/lib/erc8183/store';
import type { HiredJob, JobStatusName } from '@/lib/erc8183/types';
import { getQuestStore } from '@/lib/quest/store';
import { getAgent } from '@/lib/scan/client';

/**
 * Which agent a funded job is for, and its brief.
 *
 * Pokter's own envelope says so on chain. A job written as the seller's
 * signed quote alone does not (sellers that hash the whole description
 * refuse anything beside the quote), so the hire page names the agent and
 * this checks it: the registry's agent wallet for that identity must be the
 * job's on-chain provider. A caller cannot attribute a job to an agent
 * that is not the one being paid.
 */
export async function jobIdentity(description: string, provider: string, body: Record<string, unknown>) {
  const envelope = decodePokterJobEnvelope(description);
  if (envelope) {
    if (getAddress(envelope.provider) !== getAddress(provider)) return null;
    return {
      agentChainId: envelope.identity.chainId,
      agentTokenId: envelope.identity.tokenId,
      agentName: envelope.identity.name ?? `Agent #${envelope.identity.tokenId}`,
      providerLabel: envelope.providerLabel,
      task: envelope.task,
    };
  }
  const reference = decodeReferenceJobDescription(description);
  if (!reference) return null;
  /*
   * Named by the hire page, or else found by the provider's wallet in the
   * registry index. A page loaded before quote-only jobs existed sends no
   * identity, which left job 56997 out of Pokter's index while its seller
   * delivered it. Either way the registry check below decides.
   */
  const named = /^\d+$/.test(String(body.agentTokenId ?? '')) && (Number(body.agentChainId) === 56 || Number(body.agentChainId) === 97);
  const found = named ? null : getQuestStore().agentByWallet(provider);
  const agentChainId = named ? Number(body.agentChainId) : found?.chainId;
  const agentTokenId = named ? String(body.agentTokenId) : found?.tokenId;
  if ((agentChainId !== 56 && agentChainId !== 97) || !agentTokenId) return null;
  const agent = await getAgent(agentChainId, agentTokenId).catch(() => null);
  if (!agent?.agent_wallet || getAddress(agent.agent_wallet) !== getAddress(provider)) return null;
  const label = typeof body.providerLabel === 'string' && body.providerLabel.length <= 120 ? body.providerLabel : undefined;
  return {
    agentChainId,
    agentTokenId,
    agentName: (agent.name || `Agent #${agentTokenId}`).slice(0, 120),
    providerLabel: label,
    task: reference.task,
  };
}

/**
 * Add a funded job to Pokter's index if it is not there yet.
 *
 * The hire page indexes a job the moment funding confirms, and the public
 * node the server reads from can still be a block behind and call it
 * unfunded: jobs 56997 and 56998 were funded, notified and delivered while
 * their job pages said they were not Pokter's. The funded notice reads the
 * job again a moment later, so it indexes too.
 */
export async function indexIfMissing(input: {
  chainId: number;
  jobId: string;
  onchain: { client: string; provider: string; description: string; budget: bigint; expiredAt: bigint; statusName: string };
  identityHint: Record<string, unknown>;
}): Promise<boolean> {
  const store = getJobStore();
  if (store.all().some((job) => job.chainId === input.chainId && job.jobId === input.jobId)) return false;
  const identity = await jobIdentity(input.onchain.description, input.onchain.provider, input.identityHint);
  if (!identity) return false;
  const now = new Date().toISOString();
  const job: HiredJob = {
    id: `${input.chainId}:${input.jobId}`,
    jobId: input.jobId,
    chainId: input.chainId,
    isTestnet: input.chainId === 97,
    agentChainId: identity.agentChainId,
    agentTokenId: identity.agentTokenId,
    agentName: identity.agentName,
    providerLabel: identity.providerLabel,
    client: input.onchain.client as `0x${string}`,
    provider: input.onchain.provider as `0x${string}`,
    task: identity.task,
    budgetRaw: input.onchain.budget.toString(),
    expiredAt: new Date(Number(input.onchain.expiredAt) * 1000).toISOString(),
    hiredAt: now,
    hireTxHash: null,
    status: input.onchain.statusName as JobStatusName,
    statusCheckedAt: now,
    deliverableUrl: null,
    settleTxHash: null,
    disputeTxHash: null,
  };
  store.record(job);
  return true;
}
