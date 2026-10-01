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
  /** ERC-8004 registry chain; distinct from the escrow chain above. */
  agentChainId?: number;
  agentTokenId: string;
  agentName: string;
  /** Human label for the escrow recipient when it differs from the listing. */
  providerLabel?: string;
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
  /** Buyer-signed policy dispute, when the delivery was contested. */
  disputeTxHash?: Hex | null;
  /**
   * The transaction that pulled an expired escrow back, when one was sent.
   *
   * Recorded because "reclaimable" and "reclaimed" look identical on chain
   * from a status alone — the kernel reports EXPIRED either way — and a buyer
   * needs to know which of those happened to their money.
   */
  reclaimTxHash?: Hex | null;
}

/** What the UI needs to narrate the lifecycle honestly. */
export const JOB_STAGE_COPY: Record<JobStatusName, string> = {
  OPEN: 'Job created but not yet funded.',
  FUNDED:
    'Escrow funded. Delivery begins only after the seller accepts a funded-job notification.',
  SUBMITTED: 'Provider delivered. Dispute window open before escrow releases.',
  COMPLETED: 'Escrow released to the provider.',
  REJECTED: 'Delivery was rejected.',
  EXPIRED: 'Agent never delivered; escrow is reclaimable.',
};
