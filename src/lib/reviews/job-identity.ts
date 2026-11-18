import 'server-only';

import { decodePokterJobEnvelope } from '@/lib/erc8183/job-envelope';
import { getJobStore } from '@/lib/erc8183/store';

/**
 * The agent a job hired, as Pokter can prove it: the Pokter envelope in the
 * job's description on chain, or, for a job written as the seller's signed
 * quote alone, Pokter's index, whose identity was checked against the
 * registry when the job was indexed. Null for a job that is neither: Pokter
 * cannot say which agent it was for.
 */
export function jobAgentIdentity(chainId: number, jobId: string, description: string): { chainId: number; tokenId: string } | null {
  const envelope = decodePokterJobEnvelope(description);
  if (envelope) return { chainId: envelope.identity.chainId, tokenId: envelope.identity.tokenId };
  const indexed = getJobStore().all().find((job) => job.chainId === chainId && job.jobId === jobId) ?? null;
  return indexed ? { chainId: indexed.agentChainId ?? 56, tokenId: indexed.agentTokenId } : null;
}
