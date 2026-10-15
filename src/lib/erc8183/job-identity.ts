import 'server-only';

import { getAddress } from 'viem';

import { decodePokterJobEnvelope, decodeReferenceJobDescription } from '@/lib/erc8183/job-envelope';
import { getJobStore } from '@/lib/erc8183/store';
import type { HiredJob, JobStatusName } from '@/lib/erc8183/types';

/**
 * Which agent a funded job is for, and its brief, if it is Pokter's.
 *
 * Pokter's own envelope says so on chain. A job written as the seller's
 * signed quote alone does not, and other marketplaces write exactly that
 * format for the same sellers, so the seller's wallet is not evidence: it
 * let any reference-format job be indexed, and counted, as a Pokter hire.
 * Such a job is Pokter's only when its negotiation hash is one Pokter's
 * quote route recorded, for this provider and this escrow chain.
 */
export async function jobIdentity(description: string, provider: string, escrowChainId: number) {
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
  const intent = getJobStore().quoteIntent(reference.quote.negotiationHash);
  if (!intent || intent.escrowChainId !== escrowChainId) return null;
  if (getAddress(intent.provider) !== getAddress(provider)) return null;
  return {
    agentChainId: intent.agentChainId,
    agentTokenId: intent.agentTokenId,
    agentName: intent.agentName,
    providerLabel: undefined,
    task: reference.task,
  };
}

export async function indexIfMissing(input: {
  chainId: number;
  jobId: string;
  onchain: { client: string; provider: string; description: string; budget: bigint; expiredAt: bigint; statusName: string };
}): Promise<boolean> {
  const store = getJobStore();
  if (store.all().some((job) => job.chainId === input.chainId && job.jobId === input.jobId)) return false;
  const identity = await jobIdentity(input.onchain.description, input.onchain.provider, input.chainId);
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
