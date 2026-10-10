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
      source: job.hireTxHash ? 'onchain' : 'pending',
      detail: job.hireTxHash ? 'Creation was included in the verified hiring transaction.' : 'No creation transaction hash is stored on this device.',
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
      detail: reached >= 2 ? 'A deliverable commitment is recorded; verify the served receipt before approval.' : 'No deliverable is recorded yet.',
      transactionHash: null,
    },
    {
      id: 'reviewed', label: 'Buyer review',
      state: reached > 3 ? 'complete' : reached === 3 ? 'current' : 'upcoming',
      source: job.disputeTxHash || reached === 4 ? 'onchain' : 'pending',
      detail: job.disputeTxHash
        ? 'The buyer contested the delivery onchain.'
        : reached === 4
          ? 'Accepted by the buyer, or the review window closed without a dispute.'
          : reached >= 2
            ? 'The buyer must verify and accept or contest the result.'
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
      label: job.status === 'EXPIRED' ? 'Expired' : 'Contested',
      state: 'terminal',
      source: 'onchain',
      detail: job.status === 'EXPIRED'
        ? 'The delivery window closed. Escrow is reclaimable; expiry is not a completed job.'
        : 'The delivery was contested. It is not counted as successful work.',
      transactionHash: job.disputeTxHash ?? null,
    },
  ];
}
