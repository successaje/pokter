import type { Address, Hex } from 'viem';

import type { HiredJob } from '@/lib/erc8183/types';

/**
 * The record of a funded hire, from what funding (or a reconciliation)
 * established. One builder, so a job adopted after a reload is recorded the
 * same way as one the page saw land.
 *
 * The token is written only when the escrow confirmed it. A hire whose
 * token could not be read back is still recorded — it is funded, and a
 * missing record is what invites a second payment — with its token unknown,
 * for the sweep to read later. It is never filled in from the plan.
 */
export function fundedJobRecord(input: {
  jobId: bigint | string;
  chainId: number;
  agent: { chainId: number; tokenId: string; name: string };
  providerLabel?: string;
  provider: Address;
  task: string;
  budgetRaw: bigint | string;
  paymentToken: Address;
  tokenConfirmed: boolean;
  expiredAt: bigint | string;
  hireTxHash: Hex | null;
  at: string;
  id?: string;
}): HiredJob {
  const expiredAt = typeof input.expiredAt === 'bigint' ? new Date(Number(input.expiredAt) * 1000).toISOString() : input.expiredAt;
  return {
    id: input.id ?? `${input.chainId}:${input.jobId.toString()}`,
    jobId: input.jobId.toString(),
    chainId: input.chainId,
    isTestnet: input.chainId === 97,
    agentChainId: input.agent.chainId,
    agentTokenId: input.agent.tokenId,
    agentName: input.agent.name,
    providerLabel: input.providerLabel,
    provider: input.provider,
    task: input.task,
    budgetRaw: input.budgetRaw.toString(),
    paymentToken: input.tokenConfirmed ? input.paymentToken : null,
    expiredAt,
    hiredAt: input.at,
    hireTxHash: input.hireTxHash,
    status: 'FUNDED',
    statusCheckedAt: input.at,
    deliverableUrl: null,
    settleTxHash: null,
  };
}
