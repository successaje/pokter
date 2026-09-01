import 'server-only';

import { randomUUID } from 'node:crypto';
import {
  hireErc8183Agent,
  settleErc8183Job,
  getErc8183Job,
  getErc8183DeliverableUrl,
  erc8183Addresses,
} from '@altananetwork/sdk';
import { parseUnits, formatUnits, erc20Abi, createPublicClient, http } from 'viem';
import type { Address } from 'viem';

import { ALTANA_NETWORK, IS_TESTNET, adminSigner, altanaClient } from '@/lib/altana/client';
import { getJobStore } from './store';
import type { HiredJob, JobStatusName } from './types';

/**
 * ERC-8183 hiring.
 *
 * The kernel escrows $U rather than BNB, so hiring has a funding requirement
 * distinct from the gas needed to grant a session. Five buyer calls — createJob,
 * registerJob, setBudget, approve, fund — are batched by the SDK into one atomic
 * relay intent, so a partial hire cannot strand funds in a half-created job.
 */

export interface HireInput {
  agentTokenId: string;
  agentName: string;
  provider: Address;
  task: string;
  /** Budget in whole $U, e.g. 0.1. */
  budgetU: number;
  /** Submission time beyond the policy's dispute window. */
  deadlineSeconds?: number;
}

export class InsufficientPaymentTokenError extends Error {
  constructor(
    readonly held: string,
    readonly required: string,
  ) {
    super(
      `Wallet holds ${held} $U but the job needs ${required} $U. ` +
        'Testnet $U comes from the faucet at https://united-coin-u.github.io/u-faucet/.',
    );
    this.name = 'InsufficientPaymentTokenError';
  }
}

function publicClient() {
  return createPublicClient({
    chain: ALTANA_NETWORK.chain,
    transport: http(ALTANA_NETWORK.publicRpcUrl),
  });
}

/** Current $U balance of the Pokter wallet, in whole tokens. */
export async function paymentTokenBalance(wallet: Address): Promise<string> {
  const { paymentToken } = erc8183Addresses(ALTANA_NETWORK.chainId);
  const balance = await publicClient().readContract({
    address: paymentToken,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [wallet],
  });
  return formatUnits(balance, 18);
}

/**
 * Commission a job.
 *
 * The balance is checked before submitting rather than letting the batch revert:
 * a bare `0x` revert from the relay is not diagnosable, and "you need $U" is a
 * fact we can establish cheaply beforehand.
 */
export async function hireAgent(input: HireInput): Promise<HiredJob> {
  const client = altanaClient();
  const signer = adminSigner();
  const wallet = await client.createWallet({ signer });

  const budget = parseUnits(String(input.budgetU), 18);
  const held = await paymentTokenBalance(wallet.address);

  if (parseUnits(held, 18) < budget) {
    throw new InsufficientPaymentTokenError(held, String(input.budgetU));
  }

  const result = await hireErc8183Agent(
    wallet,
    signer,
    {
      provider: input.provider,
      task: input.task,
      budget,
      deadlineSeconds: input.deadlineSeconds ?? 1800,
    },
    { network: ALTANA_NETWORK },
  );

  const job: HiredJob = {
    id: randomUUID(),
    jobId: result.jobId.toString(),
    chainId: ALTANA_NETWORK.chainId,
    isTestnet: IS_TESTNET,
    agentTokenId: input.agentTokenId,
    agentName: input.agentName,
    provider: input.provider,
    task: input.task,
    budgetRaw: budget.toString(),
    expiredAt: new Date(Number(result.expiredAt) * 1000).toISOString(),
    hiredAt: new Date().toISOString(),
    hireTxHash: result.transactionHash ?? null,
    status: 'FUNDED',
    statusCheckedAt: new Date().toISOString(),
    deliverableUrl: null,
    settleTxHash: null,
  };

  getJobStore().record(job);
  return job;
}

/**
 * Re-read a job from chain.
 *
 * Status is never inferred from elapsed time — the kernel is the authority, and
 * a job the UI believes is complete must be one the chain says is complete.
 */
export async function refreshJob(id: string): Promise<HiredJob> {
  const store = getJobStore();
  const existing = store.byId(id);
  if (!existing) throw new Error(`No job ${id}`);

  const onChain = await getErc8183Job(ALTANA_NETWORK, BigInt(existing.jobId));

  let deliverableUrl = existing.deliverableUrl;
  if (!deliverableUrl && (onChain.statusName === 'SUBMITTED' || onChain.statusName === 'COMPLETED')) {
    deliverableUrl =
      (await getErc8183DeliverableUrl(ALTANA_NETWORK, BigInt(existing.jobId)).catch(
        () => undefined,
      )) ?? null;
  }

  const updated: HiredJob = {
    ...existing,
    status: onChain.statusName as JobStatusName,
    statusCheckedAt: new Date().toISOString(),
    deliverableUrl,
  };

  store.record(updated);
  return updated;
}

/**
 * Release escrow, or contest the delivery.
 *
 * `approve` is only valid once the dispute window has elapsed; `dispute` is
 * only valid inside it. The kernel enforces both, so a premature call reverts
 * rather than silently doing the wrong thing.
 */
export async function settleJob(
  id: string,
  action: 'approve' | 'dispute' = 'approve',
): Promise<HiredJob> {
  const store = getJobStore();
  const existing = store.byId(id);
  if (!existing) throw new Error(`No job ${id}`);

  const client = altanaClient();
  const signer = adminSigner();
  const wallet = await client.createWallet({ signer });

  const result = await settleErc8183Job(
    wallet,
    signer,
    { jobId: BigInt(existing.jobId), action },
    { network: ALTANA_NETWORK },
  );

  const settled: HiredJob = {
    ...existing,
    settleTxHash: result.transactionHash ?? null,
    statusCheckedAt: new Date().toISOString(),
  };

  store.record(settled);
  return refreshJob(id);
}

export function listJobs(): HiredJob[] {
  return getJobStore().all();
}

export function formatBudget(job: HiredJob): string {
  return `${formatUnits(BigInt(job.budgetRaw), 18)} $U`;
}
