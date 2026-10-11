import 'server-only';

import { decodePokterJobEnvelope } from '@/lib/erc8183/job-envelope';
import { COMMERCE_ABI, JOB_STATUS, QUEST_CHAINS, questClient, type QuestChainId } from './indexer';
import { marketplaceFromTask, POKTER_MARKETPLACE, summariseQuest, type QuestHire, type QuestSummary } from './progress';
import { getQuestStore } from './store';

export interface QuestLookup {
  address: string;
  hires: QuestHire[];
  summary: QuestSummary;
  /** How far each chain is indexed, so the page can say what it has not seen yet. */
  coverage: Array<{ chainId: number; throughJob: number; updatedAt: string | null }>;
}

function taskOf(description: string): string {
  try {
    const parsed = JSON.parse(description) as Record<string, unknown>;
    if (typeof parsed.task === 'string') return parsed.task;
    if (typeof parsed.task_description === 'string') return parsed.task_description;
  } catch {
    /* Plain text. */
  }
  return description;
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

  const hires: QuestHire[] = [];
  for (const job of indexed) {
    const status = fresh.get(`${job.chainId}:${job.jobId}`) ?? job.status;
    if (status === 0) continue; // never funded: not a hire
    const envelope = decodePokterJobEnvelope(job.description);
    const agent = envelope
      ? { chainId: envelope.identity.chainId, tokenId: envelope.identity.tokenId, name: envelope.identity.name ?? null }
      : store.agentByWallet(job.provider);
    hires.push({
      chainId: job.chainId,
      jobId: String(job.jobId),
      provider: job.provider,
      agent,
      marketplace: envelope ? POKTER_MARKETPLACE : marketplaceFromTask(taskOf(job.description)),
      status: JOB_STATUS[status] ?? String(status),
    });
  }

  const coverage = ([56, 97] as const).map((chainId) => {
    const cursor = store.cursor(chainId);
    return { chainId, throughJob: cursor ? cursor.nextJob - 1 : 0, updatedAt: cursor?.updatedAt ?? null };
  });
  return { address, hires, summary: summariseQuest(hires), coverage };
}
