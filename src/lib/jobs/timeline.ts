import type { HiredJob, JobStatusName } from '@/lib/erc8183/types';

export type JobEvidenceSource = 'onchain' | 'receipt' | 'pending';

export interface JobTimelineStep {
  id: 'created' | 'funded' | 'delivered' | 'reviewed' | 'settled' | 'terminal';
  label: string;
  state: 'complete' | 'current' | 'upcoming' | 'terminal';
  source: JobEvidenceSource;
  detail: string;
  transactionHash: `0x${string}` | null;
}

const REACHED: Record<JobStatusName, number> = {
  OPEN: 0,
  FUNDED: 1,
  SUBMITTED: 2,
  COMPLETED: 4,
  REJECTED: 3,
  EXPIRED: 1,
};

/**
 * Build an honest buyer-facing history from fields Pokter actually retains.
 * Missing transition timestamps remain missing; the UI must not manufacture
 * precision from the current status.
 */
export function jobTimeline(job: HiredJob): JobTimelineStep[] {
  const reached = REACHED[job.status];
  const normal: JobTimelineStep[] = [
    {
      id: 'created', label: 'Commissioned',
      state: reached > 0 ? 'complete' : 'current',
      /*
       * A job past creation exists on chain whether or not Pokter recorded
       * the transaction that made it. Marked pending, a delivered job read
       * as an unfinished payment; the missing link is only a missing link.
       */
      source: job.hireTxHash || reached > 0 ? 'onchain' : 'pending',
      detail: job.hireTxHash
        ? 'Creation was included in the verified hiring transaction.'
        : reached > 0
          ? 'Transaction link unavailable. The job exists on chain; the transaction that created it was not recorded.'
          : 'Not created yet.',
      transactionHash: job.hireTxHash,
    },
    {
      id: 'funded', label: 'Escrow funded',
      state: reached > 1 ? 'complete' : reached === 1 ? 'current' : 'upcoming',
      source: reached >= 1 ? 'onchain' : 'pending',
      detail: reached >= 1 ? 'The commerce contract reports this job as funded.' : 'Waiting for escrow funding.',
      transactionHash: reached >= 1 ? job.hireTxHash : null,
    },
    {
      id: 'delivered', label: 'Work delivered',
      state: reached > 2 ? 'complete' : reached === 2 ? 'current' : 'upcoming',
      source: reached >= 2 ? 'receipt' : 'pending',
      detail: reached >= 2 ? 'A deliverable commitment is recorded; verify the served receipt during the review window.' : 'No deliverable is recorded yet.',
      transactionHash: null,
    },
    {
      id: 'reviewed', label: 'Buyer review',
      state: reached > 3 ? 'complete' : reached === 3 ? 'current' : 'upcoming',
      source: job.disputeTxHash || reached === 4 ? 'onchain' : 'pending',
      detail: job.disputeTxHash
        ? 'The buyer contested the delivery onchain.'
        : reached === 4
          ? 'The review window closed without a successful dispute, and the job was settled.'
          : reached >= 2
            ? 'The buyer verifies the result and can dispute it until the review window closes.'
            : 'Available after delivery.',
      transactionHash: job.disputeTxHash ?? null,
    },
    {
      id: 'settled', label: 'Escrow settled',
      state: reached === 4 ? 'complete' : 'upcoming',
      source: reached === 4 ? 'onchain' : 'pending',
      detail: reached === 4 ? 'The commerce contract reports the job complete.' : 'Funds remain governed by the escrow state.',
      transactionHash: job.settleTxHash,
    },
  ];

  if (job.status !== 'REJECTED' && job.status !== 'EXPIRED') return normal;

  return [
    ...normal.filter((step) => step.state === 'complete'),
    {
      id: 'terminal',
      label: job.status === 'EXPIRED' ? 'Expired' : 'Rejected by vote',
      state: 'terminal',
      source: 'onchain',
      detail: job.status === 'EXPIRED'
        ? 'The deadline passed with the job unsettled, and the buyer reclaimed the escrow: nothing was delivered, or a delivery was never settled. Expiry is not a completed job.'
        : 'The buyer disputed the delivery, the policy’s voters rejected it, and settling refunded the buyer. It is not counted as successful work.',
      transactionHash: job.disputeTxHash ?? null,
    },
  ];
}
