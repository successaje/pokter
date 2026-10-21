import 'server-only';
import { mayStartSideEffect } from '@/lib/history/budget';

import { getErc8183Job } from '@altananetwork/sdk';

import { altanaNetworkFor } from '@/lib/altana/client';
import { isDemoSeller } from '@/lib/erc8183/demo-seller';
import { noticeDue } from '@/lib/erc8183/notice-due';
import { noticeSeller } from '@/lib/erc8183/seller-notice';
import { getJobStore } from '@/lib/erc8183/store';
import { isEscrowChain } from '@/lib/network/escrow';
import type { ChainId } from '@/lib/scan/types';

const MAX_PER_RUN = 5;

export interface NoticeSweepOutcome {
  jobId: string;
  chainId: number;
  status: string;
  /**
   * The attempt threw rather than reaching a seller.
   *
   * Distinct from `status: 'unreachable'`, which is a seller that answered
   * nothing: this is the notice never being completed at all. Previously the
   * catch below pushed nothing, so a run in which every notice threw
   * returned an empty array — indistinguishable from a run with nothing due.
   */
  failed?: true;
}

/** Tell sellers about funded jobs on any escrow chain that have no answer yet. */
export async function noticeUnansweredJobs(
  { deadlineAt }: { deadlineAt?: number } = {},
): Promise<NoticeSweepOutcome[]> {
  const store = getJobStore();
  const now = Date.now();
  const results: NoticeSweepOutcome[] = [];
  for (const job of store.all()) {
    if (results.length >= MAX_PER_RUN) break;
    if (job.status !== 'FUNDED' || !isEscrowChain(job.chainId)) continue;
    const notice = store.noticeFor(job.chainId, job.jobId);
    const due = noticeDue(
      { hiredAtMs: Date.parse(job.hiredAt), expiresAtMs: Date.parse(job.expiredAt) },
      notice ? { status: notice.status, attempts: notice.attempts, lastAtMs: Date.parse(notice.lastAt) } : null,
      now,
    );
    if (!due || (await isDemoSeller(job.provider))) continue;
    try {
      // The index can lag the chain; a delivered or reclaimed job needs no notice.
      const onchain = await getErc8183Job(altanaNetworkFor(job.chainId), BigInt(job.jobId));
      if (onchain.statusName !== 'FUNDED') continue;
      /*
       * Rechecked before the send, not only at the top of the loop.
       *
       * The escrow read above is a network call and `noticeSeller` waits up
       * to fifty seconds for a seller to answer. A notice begun with no time
       * left is one the run cannot see through, and the caller's timeout
       * bounds how long it waits rather than what this loop has started.
       */
      if (!mayStartSideEffect(deadlineAt)) break;
      const answered = await noticeSeller({
        agentChainId: (job.agentChainId ?? 56) as ChainId,
        tokenId: job.agentTokenId,
        jobId: job.jobId,
        provider: job.provider.toLowerCase(),
        escrowChainId: job.chainId,
        agentName: job.agentName,
      });
      results.push({ jobId: job.jobId, chainId: job.chainId, status: answered.status });
    } catch {
      /*
       * Reported rather than swallowed. The next sweep does try again, but a
       * run in which every notice threw used to return an empty array, which
       * reads exactly like a run with nothing to do.
       */
      results.push({ jobId: job.jobId, chainId: job.chainId, status: 'unreachable', failed: true });
    }
  }
  return results;
}
