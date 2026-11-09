import { getAddress, type Hex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

import { settleOpensAt } from './settle-window';

/**
 * What the keeper does with one of Pokter's jobs, and when it does nothing.
 *
 * Nothing in the escrow moves by itself. A delivered job pays its agent only
 * when somebody sends `Router.settle` after the review window, and an
 * undelivered one refunds its buyer only when somebody sends `claimRefund`
 * after the deadline. Both calls are open to any wallet (settle-window.ts has
 * the evidence for each), so a buyer who never comes back left an agent
 * unpaid, and an agent who never delivered left a buyer's money locked, for
 * as long as nobody did.
 *
 * The keeper is that somebody. It sends exactly what the escrow's published
 * terms already say happens, as soon as they say it can:
 *
 *   - a delivery, once its review window has closed: settle. An undisputed
 *     job pays the agent; a disputed one settles as its vote decided, which
 *     refunds the buyer when the voters rejected the work.
 *   - a job never delivered, once its deadline has passed: refund. The
 *     escrow always pays the refund to the wallet that funded the job.
 *
 * A delivery is never refunded, even past its deadline when the escrow
 * would allow it. From the deadline a settle and a refund race, and the
 * keeper's whole point on a delivered job is to settle it before that race
 * starts. Refunding finished work would be the keeper taking the buyer's
 * side in a race the terms never offered them.
 *
 * Pure, because it decides where real escrow goes and its refusals deserve
 * tests rather than a reading of the loop. `now` is chain time, the clock
 * the escrow itself checks.
 */

export type KeeperMode = 'off' | 'dry' | 'on';
export type KeeperChain = 56 | 97;

export interface KeeperConfig {
  mode: KeeperMode;
  chains: KeeperChain[];
}

/**
 * The switch, read from the environment.
 *
 * Off unless `KEEPER` says otherwise, so a merge never starts sending on its
 * own: `dry` reads and simulates and sends nothing, `on` sends. Testnet only
 * unless `KEEPER_CHAINS` names mainnet, because mainnet is real money and
 * opening it should be one deliberate step, not a side effect of turning the
 * keeper on.
 *
 * Mainnet first in the order, whatever order it was written in: the step is
 * bounded, and if a run runs short, the chain with real money in it has
 * already had its turn.
 */
export function keeperConfig(env: Readonly<Record<string, string | undefined>>): KeeperConfig {
  const raw = env.KEEPER?.trim().toLowerCase();
  const mode: KeeperMode = raw === 'on' ? 'on' : raw === 'dry' ? 'dry' : 'off';
  const named = (env.KEEPER_CHAINS ?? '')
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((chainId): chainId is KeeperChain => chainId === 56 || chainId === 97);
  const chains = named.length > 0 ? [...new Set(named)] : [97 as const];
  return { mode, chains: chains.sort((a, b) => (a === 56 ? -1 : b === 56 ? 1 : 0)) };
}

/**
 * The keeper's wallet, from `KEEPER_KEY`, or why there is none.
 *
 * A wallet of its own that holds nothing but gas. The escrow pays a
 * settlement to the agent and a refund to the buyer whoever sends it, so
 * this key decides nothing about where money goes. It must not be the
 * operator key: that key also sends from the server, and two senders on
 * one nonce drop each other's transactions.
 */
export function keeperAccountFrom(key: string | undefined, operator: string | null): { account: PrivateKeyAccount } | { account: null; error: string } {
  const trimmed = key?.trim();
  if (!trimmed) return { account: null, error: 'KEEPER_KEY is not set' };
  if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return { account: null, error: 'KEEPER_KEY is not a 32-byte hex key with its 0x prefix' };
  const account = privateKeyToAccount(trimmed as Hex);
  if (operator && getAddress(operator) === account.address) {
    return { account: null, error: 'KEEPER_KEY is the operator key; the keeper needs a wallet of its own' };
  }
  return { account };
}

export interface KeeperJobFacts {
  statusName: string;
  /** Seconds since epoch the agent submitted, or 0 when it has not. */
  submittedAt: number;
  /** Seconds since epoch the job's deadline passes. */
  expiredAt: number;
}

export interface KeeperContext {
  /** The escrow policy's review window, in seconds. */
  disputeWindowSeconds: number;
  /** Chain time, in seconds. */
  now: number;
}

export type KeeperPlan =
  | { action: 'settle'; pastDeadline: boolean }
  | { action: 'refund' }
  | { action: 'wait'; until: number; reason: string }
  | { action: 'none'; reason: string };

export type KeeperAction = 'settle' | 'refund';

export function planKeeperJob(job: KeeperJobFacts, context: KeeperContext): KeeperPlan {
  if (job.statusName === 'SUBMITTED') {
    /*
     * A delivery with no time recorded has no window to measure, and a
     * guess here would be a guess about whose money it is.
     */
    if (!(job.submittedAt > 0)) return { action: 'none', reason: 'delivered with no submission time on chain' };
    const opensAt = settleOpensAt({ submittedAt: job.submittedAt, disputeWindowSeconds: context.disputeWindowSeconds });
    if (context.now < opensAt) return { action: 'wait', until: opensAt, reason: 'review window still open' };
    return { action: 'settle', pastDeadline: context.now >= job.expiredAt };
  }
  if (job.statusName === 'FUNDED') {
    if (context.now < job.expiredAt) return { action: 'wait', until: job.expiredAt, reason: 'the agent still has time to deliver' };
    return { action: 'refund' };
  }
  if (job.statusName === 'COMPLETED') return { action: 'none', reason: 'already paid' };
  if (job.statusName === 'REJECTED') return { action: 'none', reason: 'already settled as rejected' };
  if (job.statusName === 'EXPIRED') return { action: 'none', reason: 'already refunded' };
  if (job.statusName === 'OPEN') return { action: 'none', reason: 'never funded' };
  return { action: 'none', reason: `${job.statusName.toLowerCase()}, not a state the keeper acts on` };
}
