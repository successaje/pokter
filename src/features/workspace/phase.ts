import type { HiredJob } from '@/lib/erc8183/types';
import { isReclaimable } from '@/lib/erc8183/reclaim-gate';

/*
 * Kept apart from the hooks so it can be tested without the wallet SDK:
 * which phase a job is in decides what the buyer is asked to do, and the
 * list, the overview and the job page must all agree on it.
 */

export type JobPhase = 'unfunded' | 'working' | 'review' | 'reclaim' | 'settled' | 'disputed' | 'rejected' | 'refunded' | 'expired';

/**
 * The job's state in the buyer's terms. On-chain status names are shown
 * too, but this is what decides what the person is asked to do next.
 */
export function jobPhase(job: HiredJob, now = Date.now()): JobPhase {
  if (job.status === 'OPEN') return 'unfunded';
  /*
   * A disputed delivery waits on the policy's voters, not on the buyer —
   * until its deadline passes without a quorum, when the escrow can be
   * claimed back even though the status still reads SUBMITTED.
   */
  if (job.status === 'SUBMITTED') {
    if (!job.disputeTxHash) return 'review';
    return isReclaimable(job, now) ? 'reclaim' : 'disputed';
  }
  if (job.status === 'COMPLETED') return 'settled';
  if (job.status === 'REJECTED') return job.reclaimTxHash ? 'refunded' : 'rejected';
  if (job.reclaimTxHash) return 'refunded';
  /*
   * The escrow has been observed to mark a job EXPIRED once its refund is
   * claimed (see reclaim-gate). So EXPIRED is shown as "likely refunded", not
   * as money waiting; reclaim stays available on the job page in case it is
   * not, because hiding it would be the costlier mistake.
   */
  if (job.status === 'EXPIRED') return 'expired';
  if (isReclaimable(job, now)) return 'reclaim';
  return 'working';
}

export const PHASE: Record<JobPhase, { label: string; tone: 'ok' | 'watch' | 'info' | 'bad' | 'none'; needsYou: boolean; next: string }> = {
  unfunded: { label: 'Not funded', tone: 'none', needsYou: false, next: 'This job was created but never funded. Nothing is held.' },
  working: { label: 'In progress', tone: 'info', needsYou: false, next: 'Escrow is funded. Waiting for the agent to deliver.' },
  review: { label: 'Delivered · review it', tone: 'watch', needsYou: true, next: 'The agent delivered. Check the file now: you can dispute it until the review window closes, and the payment is released after it.' },
  reclaim: { label: 'Not delivered · reclaim', tone: 'watch', needsYou: true, next: 'The deadline passed with nothing delivered. Your escrow can be reclaimed.' },
  settled: { label: 'Settled', tone: 'ok', needsYou: false, next: 'Payment was released to the agent.' },
  disputed: { label: 'Disputed · vote open', tone: 'bad', needsYou: false, next: 'You disputed the delivery, so it is no longer paid by silence. The escrow policy’s voters decide: at the quorum of reject votes the job is rejected and the agent is not paid; without it by the deadline the job expires and you reclaim the escrow then.' },
  rejected: { label: 'Rejected · refund', tone: 'bad', needsYou: false, next: 'The policy’s voters rejected the delivery, so the agent is not paid and the escrow goes back to the wallet that funded it. If it has not arrived, you can try reclaiming it.' },
  refunded: { label: 'Refunded', tone: 'none', needsYou: false, next: 'The escrow was returned to your wallet.' },
  expired: { label: 'Expired · likely refunded', tone: 'none', needsYou: false, next: 'The job ran past its deadline without being paid: nothing was delivered, or a dispute did not reach its quorum in time. The contract marks a job expired once its escrow is reclaimed, so the money has most likely already returned to the funding wallet.' },
};

