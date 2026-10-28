import 'server-only';

import { decodePokterJobEnvelope } from '@/lib/erc8183/job-envelope';
import { COMMERCE_ABI, JOB_STATUS, QUEST_CHAINS, questClient, type QuestChainId } from './indexer';
import { marketplaceFromRecord, POKTER_MARKETPLACE, summariseQuest, type QuestHire, type QuestSummary } from './progress';
import { getQuestStore } from './store';
import { getJobStore } from '@/lib/erc8183/store';
import { getProbeStore } from '@/lib/history/store';

export interface QuestLookup {
  address: string;
  hires: QuestHire[];
  summary: QuestSummary;
  /** How far each chain is indexed, so the page can say what it has not seen yet. */
  coverage: Array<{ chainId: number; throughJob: number; updatedAt: string | null }>;
}

/**
 * The agent a paid wallet signed prices for, on the job's chain, when it is
 * exactly one.
 *
 * The wallet table (`agentByWallet`) is filled by the sweep, so an agent
 * listed since the last run, or one outside the listings it read, was shown
 * as "Not matched to a listed agent". A signed price names the agent and the
 * wallet that signed it. A wallet that signed for several agents on one
 * chain names none of them: guessing would credit the wrong agent.
 */
function agentBySignedPrice(chainId: number, wallet: string): { chainId: number; tokenId: string; name: string | null } | null {
  const agents = getProbeStore().agentsBySigner(wallet).filter((agent) => agent.chainId === chainId);
  return agents.length === 1 ? { ...agents[0], name: null } : null;
}

/**
 * A wallet's hires since the campaign opened, on both escrow contracts.
 *
 * Statuses are re-read from chain (a job indexed as open may have been
 * funded since). Each agent is identified from Pokter's envelope when the
 * job carries one, otherwise by matching the paid wallet to a listed
 * agent's registered wallet. The marketplace is taken only from what the
 * job's record states.
 */
export async function lookupQuest(address: string): Promise<QuestLookup> {
  const store = getQuestStore();
  const indexed = store.byClient(address);

  const byChain = new Map<QuestChainId, typeof indexed>();
  for (const job of indexed) {
    const chainId = job.chainId as QuestChainId;
    if (!(chainId in QUEST_CHAINS)) continue;
    byChain.set(chainId, [...(byChain.get(chainId) ?? []), job]);
  }
  const fresh = new Map<string, number>();
  await Promise.all(
    [...byChain.entries()].map(async ([chainId, jobs]) => {
      const client = questClient(chainId);
      const reads = await Promise.all(
        jobs.map((j) => client.readContract({ address: QUEST_CHAINS[chainId].commerce, abi: COMMERCE_ABI, functionName: 'getJob', args: [BigInt(j.jobId)] }).catch(() => null)),
      );
      reads.forEach((read, i) => {
        if (read) fresh.set(`${chainId}:${jobs[i].jobId}`, read.status);
      });
    }),
  );

  // Jobs written as the seller's signed quote alone carry no Pokter envelope;
  // Pokter's own index still says it commissioned them.
  const pokterIndexed = new Map(getJobStore().all().map((j) => [`${j.chainId}:${j.jobId}`, j]));

  const hires: QuestHire[] = [];
  for (const job of indexed) {
    const status = fresh.get(`${job.chainId}:${job.jobId}`) ?? job.status;
    if (status === 0) continue; // never funded: not a hire
    const envelope = decodePokterJobEnvelope(job.description);
    const ours = envelope ? null : pokterIndexed.get(`${job.chainId}:${job.jobId}`) ?? null;
    const agent = envelope
      ? { chainId: envelope.identity.chainId, tokenId: envelope.identity.tokenId, name: envelope.identity.name ?? null }
      : ours
        ? { chainId: ours.agentChainId ?? 56, tokenId: ours.agentTokenId, name: ours.agentName }
        : store.agentByWallet(job.provider) ?? agentBySignedPrice(job.chainId, job.provider);
    hires.push({
      chainId: job.chainId,
      jobId: String(job.jobId),
      provider: job.provider,
      agent,
      marketplace: envelope || ours ? POKTER_MARKETPLACE : marketplaceFromRecord(job.description),
      status: JOB_STATUS[status] ?? String(status),
    });
  }

  const coverage = ([56, 97] as const).map((chainId) => {
    const cursor = store.cursor(chainId);
    return { chainId, throughJob: cursor ? cursor.nextJob - 1 : 0, updatedAt: cursor?.updatedAt ?? null };
  });
  return { address, hires, summary: summariseQuest(hires), coverage };
}
