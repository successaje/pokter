import 'server-only';

import { buildClaimRefundCall } from '@altananetwork/sdk';
import { createPublicClient, createWalletClient, encodeFunctionData, formatEther, getAddress, parseEther, type Address, type Hex } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';

import { altanaNetworkFor } from '@/lib/altana/client';
import { sendOperatorAlert } from '@/lib/alerts/operator';
import { readTransport } from '@/lib/chain/rpc';
import { readUrlsKeeping, sendingTransport } from '@/lib/chain/transport';
import { isEscrowChain } from '@/lib/network/escrow';
import { operatorAddress } from '@/lib/team/server';

import { correctedErc8183Addresses } from './addresses';
import { withoutClaimedIds } from './claimed-ids';
import { disputeWindowSeconds } from './dispute-window';
import { readErc8183Job } from './get-job';
import { jobAmountLabel } from './job-amount';
import { keeperAccountFrom, keeperConfig, type KeeperAction, type KeeperChain, type KeeperMode } from './keeper-plan';
import { keeperSummary, runKeeperChain, type KeeperChainOutcome } from './keeper-run';
import { getJobStore } from './store';

/**
 * The keeper, wired to the chain: settles Pokter's delivered jobs once their
 * review window closes, and refunds the ones never delivered once their
 * deadline passes (`keeper-plan.ts` has the rules, `keeper-run.ts` the loop).
 *
 * It runs inside the sweep, as a critical step, for the reason hire watching
 * does: the sweep is already scheduled, secret-guarded and running when
 * nobody is watching, and a second timer would be a second thing to notice
 * had stopped.
 *
 * Only Pokter's jobs, the ones in its index. The escrow is shared, and other
 * front ends' jobs are theirs to keep.
 *
 * It signs with `KEEPER_KEY`, a wallet of its own that holds nothing but gas
 * and is never the operator key (`keeperAccountFrom`).
 */

/** A run sends at most this many transactions per chain; the rest wait a sweep. */
const MAX_SENDS = 6;
/** Below this the keeper sends nothing on that chain. A settle costs about 0.000006 BNB. */
const MIN_BALANCE = parseEther('0.0005');
/** How long a send waits for its receipt before leaving the job to the next run. */
const CONFIRM_MS = 12_000;
/** An address for dry runs without a key. Neither call checks its sender, so any address simulates the same. */
const SIMULATION_SENDER = getAddress('0x000000000000000000000000000000000000dEaD');

const SETTLE_ABI = [{ name: 'settle', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'evidence', type: 'bytes' }], outputs: [] }] as const;

const ALERTED = 'keeper-alerted';
const GAS_ALERT_EVERY_MS = 24 * 60 * 60 * 1000;

export interface KeeperOutcome {
  mode: KeeperMode;
  /** The keeper wallet, when a key is set. */
  wallet: Address | null;
  chains: KeeperChainOutcome[];
  error?: string;
  summary: string;
}

function callFor(chainId: KeeperChain, action: KeeperAction, jobId: string): { to: Address; data: Hex } {
  if (action === 'settle') {
    return {
      to: getAddress(correctedErc8183Addresses(chainId).router),
      data: encodeFunctionData({ abi: SETTLE_ABI, functionName: 'settle', args: [BigInt(jobId), '0x'] }),
    };
  }
  const call = buildClaimRefundCall(chainId, BigInt(jobId));
  return { to: getAddress(call.to), data: call.data as Hex };
}

/** Pokter's jobs on this chain the index still shows open, the nearest deadline first. */
function candidatesFor(chainId: KeeperChain) {
  return withoutClaimedIds(getJobStore().all())
    .filter((job) => job.chainId === chainId && (job.status === 'FUNDED' || job.status === 'SUBMITTED'))
    .sort((a, b) => Date.parse(a.expiredAt) - Date.parse(b.expiredAt))
    .map((job) => ({ jobId: job.jobId, amount: jobAmountLabel(job) }));
}

async function runOnChain(
  chainId: KeeperChain,
  mode: 'dry' | 'on',
  account: PrivateKeyAccount | null,
  deadlineAt: number | undefined,
): Promise<KeeperChainOutcome> {
  const network = altanaNetworkFor(chainId);
  const commerce = getAddress(correctedErc8183Addresses(chainId).commerce);
  /* Reads as the server's job reads go, through several nodes (job-read.ts); sends and receipts through nodes that serve receipts (transport.ts). */
  const read = createPublicClient({
    chain: network.chain,
    transport: readTransport(chainId, readUrlsKeeping(chainId, network.publicRpcUrl, chainId === 56 ? process.env.BSC_MAINNET_RPC_URL : undefined)),
  });
  const confirmer = createPublicClient({ chain: network.chain, transport: sendingTransport(chainId) });
  const wallet = account ? createWalletClient({ account, chain: network.chain, transport: sendingTransport(chainId) }) : null;
  const from = account?.address ?? SIMULATION_SENDER;

  return runKeeperChain(
    {
      chainId,
      candidates: candidatesFor(chainId),
      readJob: async (jobId) => {
        const job = await readErc8183Job(read, commerce, BigInt(jobId));
        return { statusName: job.statusName, submittedAt: Number(job.submittedAt), expiredAt: Number(job.expiredAt) };
      },
      chainNow: async () => Number((await read.getBlock()).timestamp),
      disputeWindowSeconds: () => disputeWindowSeconds(chainId),
      simulate: async (action, jobId) => {
        await read.call({ account: from, ...callFor(chainId, action, jobId) });
      },
      balance: () => read.getBalance({ address: from }),
      nonce: () => confirmer.getTransactionCount({ address: from, blockTag: 'pending' }),
      send: async (action, jobId, nonce) => {
        if (!wallet) throw new Error('no keeper wallet');
        return wallet.sendTransaction({ ...callFor(chainId, action, jobId), nonce });
      },
      confirm: async (hash) => {
        const left = deadlineAt === undefined ? CONFIRM_MS : Math.min(CONFIRM_MS, deadlineAt - Date.now());
        if (left < 1_000) return 'unknown';
        try {
          return (await confirmer.waitForTransactionReceipt({ hash, timeout: left, pollingInterval: 1_000 })).status;
        } catch {
          return 'unknown';
        }
      },
      record: async (jobId, action, hash) => {
        const after = await readErc8183Job(read, commerce, BigInt(jobId)).then((job) => job.statusName).catch(() => null);
        const store = getJobStore();
        for (const row of withoutClaimedIds(store.all()).filter((job) => job.chainId === chainId && job.jobId === jobId)) {
          store.record({
            ...row,
            ...(action === 'settle' ? { settleTxHash: hash } : { reclaimTxHash: hash }),
            ...(after ? { status: after as typeof row.status, statusCheckedAt: new Date().toISOString() } : {}),
          });
        }
        return after;
      },
    },
    { mode, maxSends: MAX_SENDS, minBalance: MIN_BALANCE, deadlineAt },
  );
}

/**
 * Tell the operator what needs a person: a send that failed, or a wallet
 * too low to send. Mainnet sends are reported too, because they are real
 * money moving on Pokter's signature and someone should see each one.
 * Never throws; the keeper's work is done by the time this runs.
 */
async function alertIfNeeded(outcome: KeeperOutcome, deadlineAt: number | undefined): Promise<void> {
  if (deadlineAt !== undefined && Date.now() >= deadlineAt) return;
  const store = getJobStore();
  const remembered = (() => {
    try {
      return JSON.parse(store.readCursor(ALERTED) ?? '{}') as { gasAt?: Record<string, number>; failed?: string[] };
    } catch {
      return {};
    }
  })();
  const lines: string[] = [];
  const failedKeys: string[] = [];
  const gasAt = { ...(remembered.gasAt ?? {}) };
  for (const chain of outcome.chains) {
    for (const job of chain.outcomes) {
      const key = `${chain.chainId}:${job.jobId}:${job.action}`;
      if ((job.result === 'failed' || job.result === 'reverted') && !(remembered.failed ?? []).includes(key)) {
        lines.push(`#${job.jobId} on chain ${chain.chainId}: ${job.action} ${job.result}${job.reason ? ` (${job.reason})` : ''}${job.hash ? ` · ${job.hash}` : ''}`);
        failedKeys.push(key);
      }
      if (chain.chainId === 56 && job.result === 'confirmed') {
        lines.push(`#${job.jobId} on chain 56: ${job.action === 'settle' ? 'settled' : 'refunded'} ${job.amount}, now ${job.after ?? 'unread'} · ${job.hash}`);
      }
    }
    if (chain.stopped === 'gas' && Date.now() - (gasAt[chain.chainId] ?? 0) > GAS_ALERT_EVERY_MS) {
      lines.push(`Chain ${chain.chainId}: the keeper wallet ${outcome.wallet} is below ${formatEther(MIN_BALANCE)} BNB, so ${chain.due} due job${chain.due === 1 ? ' is' : 's are'} waiting for gas.`);
      gasAt[chain.chainId] = Date.now();
    }
  }
  if (outcome.error && outcome.mode === 'on') lines.push(`The keeper is on but cannot send: ${outcome.error}.`);
  if (lines.length === 0) return;
  try {
    const delivery = await sendOperatorAlert({ subject: 'Pokter keeper', body: lines.join('\n') });
    if (delivery.telegram === 'sent' || delivery.email === 'sent') {
      store.writeCursor(ALERTED, JSON.stringify({ gasAt, failed: [...(remembered.failed ?? []), ...failedKeys].slice(-60) }));
    }
  } catch {
    /* A lost alert costs a message; the outcome is still in the sweep's response and log line. */
  }
}

export async function runKeeper({ deadlineAt }: { deadlineAt?: number } = {}): Promise<KeeperOutcome> {
  const config = keeperConfig(process.env);
  if (config.mode === 'off') return { mode: 'off', wallet: null, chains: [], summary: '' };

  const key = keeperAccountFrom(process.env.KEEPER_KEY, operatorAddress());
  const account = key.account;
  const error = key.account ? undefined : key.error;
  const mode = config.mode;
  /* On without a usable key is reported and reads nothing: a dry run is what to use to watch without one. */
  if (mode === 'on' && !account) {
    const outcome: KeeperOutcome = { mode, wallet: null, chains: [], error, summary: `${error}` };
    await alertIfNeeded(outcome, deadlineAt);
    return outcome;
  }

  const chains: KeeperChainOutcome[] = [];
  for (const chainId of config.chains) {
    if (!isEscrowChain(chainId)) continue;
    try {
      chains.push(await runOnChain(chainId, mode, account, deadlineAt));
    } catch (failure) {
      chains.push({ chainId, mode, checked: 0, unread: 0, waiting: 0, due: 0, outcomes: [], stopped: null, error: (failure as Error).message.split('\n')[0] });
    }
  }
  const outcome: KeeperOutcome = { mode, wallet: account?.address ?? null, chains, summary: keeperSummary(chains) };
  if (outcome.summary) console.log(`[keeper] ${outcome.summary}`);
  await alertIfNeeded(outcome, deadlineAt);
  return outcome;
}
