import type { Address, Hex } from 'viem';

/** Job lifecycle, order-locked with the AgenticCommerce kernel. */
export type JobStatusName =
  | 'OPEN'
  | 'FUNDED'
  | 'SUBMITTED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'EXPIRED';

/** A job Pokter commissioned, as persisted and displayed. */
export interface HiredJob {
  id: string;
  jobId: string;
  chainId: number;
  isTestnet: boolean;
  agentTokenId: string;
  agentName: string;
  provider: Address;
  task: string;
  /** Raw $U units, 18 decimals. */
  budgetRaw: string;
  expiredAt: string;
  hiredAt: string;
  hireTxHash: Hex | null;
  /** Last status read from chain, refreshed on demand. */
  status: JobStatusName;
  statusCheckedAt: string;
  deliverableUrl: string | null;
  settleTxHash: Hex | null;
}

/** What the UI needs to narrate the lifecycle honestly. */
export const JOB_STAGE_COPY: Record<JobStatusName, string> = {
  OPEN: 'Job created but not yet funded.',
  FUNDED: 'Escrow funded. Waiting for the agent to deliver.',
  SUBMITTED: 'Agent delivered. Dispute window open before escrow releases.',
  COMPLETED: 'Escrow released to the agent.',
  REJECTED: 'Delivery was rejected.',
  EXPIRED: 'Agent never delivered; escrow is reclaimable.',
};
