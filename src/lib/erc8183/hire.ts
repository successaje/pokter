import 'server-only';

import { randomUUID } from 'node:crypto';
import {
  settleErc8183Job,
  getErc8183Job,
  getErc8183DeliverableUrl,
  buildClaimRefundCall,
  buildHireCalls,
} from '@altananetwork/sdk';
import { parseUnits, formatUnits, erc20Abi, createPublicClient, getAddress, http } from 'viem';
import type { Address } from 'viem';

import { correctedErc8183Addresses } from './addresses';

import { DELIVERY_WINDOW_SECONDS, jobLifetimeSeconds } from './deadline';
import { formatAmount, requireDecimals } from '@/lib/network/tokens';
import { ALTANA_NETWORK, IS_TESTNET, adminSigner, altanaClient } from '@/lib/altana/client';
import { attributeJob } from './attribute-owners';
import { getJobStore } from './store';
import { isThisHire } from './hire-confirm';
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
  /**
   * The agent's ERC-8004 registry chain, when the caller knows it.
   *
   * Left unset the row stores NULL, and `byAgent` reads NULL as "chain 56"
   * for the legacy rows written before the column existed — so a hire of a
   * chain-97 agent became unfindable by its own identity. Never defaulted
   * to the escrow chain: a mainnet-registered agent is hired on testnet
   * whenever its price cannot settle on 56, and that would file it under
   * the wrong registry.
   */
  agentChainId?: number;
  agentName: string;
  provider: Address;
  task: string;
  /**
   * What goes on chain as the job description, when it differs from `task`.
   *
   * The two were one field, so the brief was written to chain raw. A
   * description that is not a `pokter-job` envelope is not recognised by
   * `jobIdentity` — deliberately, so another marketplace's jobs cannot be
   * counted as Pokter hires — so such a job can never be indexed, noticed
   * or delivered. Two fixture hires were funded that way and could not
   * complete. The envelope belongs on chain; `task` stays the brief the
   * store keeps and the agent is asked.
   */
  description?: string;
  /** Budget in whole $U, e.g. 0.1. */
  budgetU: number;
  /** Submission time beyond the policy's dispute window. */
  deadlineSeconds?: number;
}

/**
 * Revert selectors observed on BSC testnet, mapped to what they actually mean.
 *
 * The relay returns a bare selector with no reason string, which is unreadable
 * in a UI and unactionable in a bug report. These two were isolated by running
 * the batch's five calls individually against a job we created — see
 * docs/integrations/erc8183.md for the full trace.
 */
const KNOWN_REVERTS: Record<string, string> = {
  '0xc94463e3':
    'The EvaluatorRouter rejected registerJob. This step binds the dispute policy to the job, and the current BSC testnet deployment reverts on it for every caller we tried.',
  '0x32d53d69':
    'The kernel rejected fund. Budget and $U allowance were both set correctly, so this follows from registerJob having failed — an unregistered job cannot be funded.',
};

function explainRevert(message: string): string {
  for (const [selector, explanation] of Object.entries(KNOWN_REVERTS)) {
    if (message.includes(selector)) return `${explanation} (revert ${selector})`;
  }
  return message;
}

export class InsufficientPaymentTokenError extends Error {
  constructor(
    readonly held: string,
    readonly required: string,
  ) {
    super(
      `Wallet holds ${held} $U but the job needs ${required} $U. ` +
        // Only name a faucet where one exists; on mainnet $U has to be
        // acquired, and pointing at a testnet faucet would be worse than
        // saying nothing.
        (IS_TESTNET
          ? 'Testnet $U comes from the faucet at https://united-coin-u.github.io/u-faucet/.'
          : 'Fund the wallet with $U before commissioning.'),
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

const COMMERCE_ABI = [
  {
    type: 'function',
    name: 'jobCounter',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

const POLICY_ABI = [
  {
    type: 'function',
    name: 'disputeWindow',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint64' }],
  },
] as const;

/** Current $U balance of the Pokter wallet, in whole tokens. */
export async function paymentTokenBalance(wallet: Address): Promise<string> {
  const { paymentToken } = correctedErc8183Addresses(ALTANA_NETWORK.chainId);
  const balance = await publicClient().readContract({
    address: paymentToken,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [wallet],
  });
  return formatUnits(balance, requireDecimals(ALTANA_NETWORK.chainId, paymentToken));
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
  const signer = adminSigner('legacy-hire');
  const wallet = await client.createWallet({ signer });

  /*
   * Scale from the token, not from a literal.
   *
   * Every token either escrow currently settles in has eighteen decimals, so
   * this computes the same amount it did before. It stops being the same the
   * first time an amount is denominated in something else: testnet USDC has
   * six, and a literal 18 against it would approve and transfer an amount
   * 10^12 too large. `requireDecimals` throws on a token Pokter has not
   * verified rather than falling back, because there is no safe default
   * scale for money.
   */
  const { paymentToken: hireToken } = correctedErc8183Addresses(ALTANA_NETWORK.chainId);
  const decimals = requireDecimals(ALTANA_NETWORK.chainId, hireToken);
  const budget = parseUnits(String(input.budgetU), decimals);
  const held = await paymentTokenBalance(wallet.address);

  if (parseUnits(held, decimals) < budget) {
    throw new InsufficientPaymentTokenError(held, String(input.budgetU));
  }

  // Built here rather than via the SDK's hireErc8183Agent, which resolves its
  // own (stale on testnet) policy address internally and offers no override.
  const addresses = correctedErc8183Addresses(ALTANA_NETWORK.chainId);
  const rpc = publicClient();

  const [disputeWindow, jobCounter] = await Promise.all([
    rpc.readContract({
      address: addresses.policy,
      abi: POLICY_ABI,
      functionName: 'disputeWindow',
    }),
    rpc.readContract({
      address: addresses.commerce,
      abi: COMMERCE_ABI,
      functionName: 'jobCounter',
    }),
  ]);

  // Job ids are 1-indexed and predicted from the counter. If another job lands
  // in the same block the batch reverts harmlessly — registerJob is
  // client-only — so the counter is re-read on retry rather than cached.
  const jobId = jobCounter + 1n;
  // The same rule as the browser-wallet hire (see `deadline.ts`).
  const expiredAt =
    BigInt(Math.floor(Date.now() / 1000)) +
    BigInt(jobLifetimeSeconds(disputeWindow, input.deadlineSeconds ?? DELIVERY_WINDOW_SECONDS));

  const calls = buildHireCalls({
    addresses,
    jobId,
    provider: input.provider,
    description: input.description ?? input.task,
    budget,
    expiredAt,
  });

  let result;
  try {
    result = await client.execute({ wallet, signer, calls });
  } catch (error) {
    throw new Error(explainRevert((error as Error).message));
  }

  /*
   * Confirm the predicted id is this hire's job before recording it (see
   * hire-confirm.ts). The read is retried briefly because the RPC can lag
   * the transaction it just confirmed.
   */
  const description = input.description ?? input.task;
  let confirmed = false;
  for (let attempt = 0; attempt < 5 && !confirmed; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2_000));
    const onchain = await getErc8183Job(ALTANA_NETWORK, jobId).catch(() => null);
    confirmed = onchain !== null && isThisHire(onchain, { client: wallet.address, provider: input.provider, description });
  }
  if (!confirmed) {
    throw new Error(`The hire reported success, but job ${jobId} on chain is not this hire's job, so nothing was recorded. Check the transaction ${result.transactionHash ?? '(no hash returned)'} before retrying.`);
  }

  const job: HiredJob = {
    id: randomUUID(),
    jobId: jobId.toString(),
    chainId: ALTANA_NETWORK.chainId,
    isTestnet: IS_TESTNET,
    agentTokenId: input.agentTokenId,
    agentName: input.agentName,
    provider: input.provider,
    task: input.task,
    budgetRaw: budget.toString(),
    expiredAt: new Date(Number(expiredAt) * 1000).toISOString(),
    ...(input.agentChainId === undefined ? {} : { agentChainId: input.agentChainId }),
    hiredAt: new Date().toISOString(),
    hireTxHash: result.transactionHash ?? null,
    status: 'FUNDED',
    statusCheckedAt: new Date().toISOString(),
    deliverableUrl: null,
    settleTxHash: null,
  };

  getJobStore().record(job);
  void attributeJob(job).catch(() => false);
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
  const signer = adminSigner('legacy-hire');
  const wallet = await client.createWallet({ signer });

  const result = await settleErc8183Job(
    wallet,
    signer,
    { jobId: BigInt(existing.jobId), action },
    { network: ALTANA_NETWORK },
  );

  /*
   * A contested delivery is not a settlement.
   *
   * Both outcomes were written to settleTxHash, so a disputed job came back
   * from this path looking settled — the record said the money had been
   * released when the buyer had just refused to release it. The type has
   * carried a disputeTxHash for exactly this since the field was added; this
   * path simply never used it.
   */
  const settled: HiredJob = {
    ...existing,
    ...(action === 'dispute'
      ? { disputeTxHash: result.transactionHash ?? null }
      : { settleTxHash: result.transactionHash ?? null }),
    statusCheckedAt: new Date().toISOString(),
  };

  store.record(settled);
  return refreshJob(id);
}

export function listJobs(): HiredJob[] {
  return getJobStore().all();
}

/**
 * A job's budget, in the money it was funded in.
 *
 * Every job on record was created through `createJob`, which funds in the
 * escrow's default token, so the chain's default is the right token for all
 * of them. That holds for existing rows under the current deployment and
 * default token; it is not a guarantee about an upgradeable contract, and it
 * stops holding the moment a hire is placed with `createJobWithToken`. When
 * that happens the job needs its token recorded — see the note in
 * `lib/network/tokens` — and this function needs to read it rather than
 * infer it.
 */
export function formatBudget(job: HiredJob): string {
  const { paymentToken } = correctedErc8183Addresses(job.chainId);
  return formatAmount(job.chainId, paymentToken, job.budgetRaw)?.label
    ?? `${job.budgetRaw} raw units`;
}

/**
 * Pull an expired escrow back to the wallet that funded it.
 *
 * `settleJob` releases or contests a delivery; neither applies to a job
 * that was never delivered. The only reclaim path was
 * `reclaimFromExternalWallet`, which signs with the browser wallet, so a
 * hire funded by the admin signer — every script and route hire — had no
 * way to get its budget back. Expired test escrow simply accumulated.
 *
 * The escrow refuses a reclaim before expiry and the revert says nothing
 * useful, so the preconditions are read from chain first and reported as
 * sentences. Reclaiming is the buyer's own action, here as in the UI:
 * nothing reclaims on a schedule.
 */
export async function reclaimJob(jobId: string): Promise<{ jobId: string; transactionHash: string | null; budget: string }> {
  if (!/^\d+$/.test(jobId)) throw new Error(`"${jobId}" is not a job id.`);
  const client = altanaClient();
  const signer = adminSigner('legacy-hire');
  const wallet = await client.createWallet({ signer });

  const onchain = await getErc8183Job(ALTANA_NETWORK, BigInt(jobId));
  if (getAddress(onchain.client) !== getAddress(wallet.address)) {
    throw new Error(`Job ${jobId} was funded by ${onchain.client}, not by this wallet (${wallet.address}).`);
  }
  if (onchain.statusName !== 'FUNDED' && onchain.statusName !== 'EXPIRED') {
    throw new Error(`Job ${jobId} is ${onchain.statusName.toLowerCase()}; there is no escrow left to reclaim.`);
  }
  const expiresAt = Number(onchain.expiredAt) * 1000;
  if (expiresAt > Date.now()) {
    throw new Error(
      `Job ${jobId} expires ${new Date(expiresAt).toISOString()}; the agent still has time to deliver, and the escrow will not release before then.`,
    );
  }

  const call = buildClaimRefundCall(ALTANA_NETWORK.chainId, BigInt(jobId));
  let result;
  try {
    result = await client.execute({ wallet, signer, calls: [call] });
  } catch (error) {
    throw new Error(explainRevert((error as Error).message));
  }

  /*
   * Found by job id and escrow chain, not by row id: `hireAgent` writes a
   * UUID there while the chain indexer writes "<chainId>:<jobId>", so a
   * `byId` lookup finds only half the rows and silently skips the rest.
   */
  const existing = getJobStore()
    .all()
    .find((job) => job.jobId === jobId && job.chainId === ALTANA_NETWORK.chainId);
  if (existing) {
    getJobStore().record({
      ...existing,
      reclaimTxHash: (result.transactionHash ?? null) as HiredJob['reclaimTxHash'],
      statusCheckedAt: new Date().toISOString(),
    });
  }

  return { jobId, transactionHash: result.transactionHash ?? null, budget: formatUnits(onchain.budget, requireDecimals(ALTANA_NETWORK.chainId, correctedErc8183Addresses(ALTANA_NETWORK.chainId).paymentToken)) };
}
