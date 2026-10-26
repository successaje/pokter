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
  /** The wallet that funded the escrow, as read from chain. Absent on rows indexed before it was kept. */
  client?: Address;
  task: string;
  /** Raw units of `paymentToken`, at that token's decimals. */
  budgetRaw: string;
  /**
   * The token the escrow job is bound to: recorded at funding, or read from
   * the escrow's `jobPaymentToken`. Absent or null means not known yet —
   * never "therefore $U". Rows written before this field existed are filled
   * by `scripts/backfill-job-currencies.mts`, which leaves a failed read null.
   */
  paymentToken?: Address | null;
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
   * This used to say the kernel reports EXPIRED whether or not the refund
   * was taken, so status could never distinguish. Observation says
   * otherwise, and `reclaim-gate` records it: a job sits at FUNDED however
   * far past its expiry it is, and moves to EXPIRED when the refund is
   * claimed. Three sets of jobs now agree — #1363, then #1364 and #1365,
   * then #1372 and #1373, each of which stayed FUNDED past expiry and
   * turned EXPIRED only once reclaimed.
   *
   * The hash is still worth recording. It is proof of which transaction
   * returned the money, it survives a reclaim made from another device
   * where this index would otherwise never learn of it, and the status
   * reading is an observation of one deployment rather than a guarantee
   * from the contract. See `isReclaimable` for why the gate stays
   * deliberately generous despite all this.
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
  REJECTED: 'The buyer disputed the delivery, the policy’s voters rejected it, and settling refunded the buyer. The provider was not paid.',
  EXPIRED: 'The deadline passed with the job unsettled and the buyer reclaimed the escrow: nothing was delivered, or a delivery was never settled.',
};
