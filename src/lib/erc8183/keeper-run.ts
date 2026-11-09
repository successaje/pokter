import { mapWithConcurrency } from '@/lib/concurrency';

import { planKeeperJob, type KeeperAction, type KeeperChain, type KeeperJobFacts, type KeeperPlan } from './keeper-plan';

/**
 * One keeper run on one escrow chain: read Pokter's open jobs, and send what
 * each is owed.
 *
 * Everything that touches a network is passed in, so the rules that keep it
 * safe are tested without one: nothing is sent in a dry run, a call the
 * escrow would refuse is never sent, the wallet stops below its gas floor,
 * a run sends at most `maxSends`, and nothing new starts after the deadline.
 * `keeper.ts` supplies the chain.
 */

export interface KeeperCandidate {
  jobId: string;
  /** What the job holds, in its own token, for the report. */
  amount: string;
}

export interface KeeperChainDeps {
  chainId: KeeperChain;
  /** Pokter's jobs the index still shows open, most urgent first. */
  candidates: readonly KeeperCandidate[];
  /** The job as the escrow holds it now: never the index, which may be a sweep behind. */
  readJob(jobId: string): Promise<KeeperJobFacts>;
  /** Chain time, in seconds. */
  chainNow(): Promise<number>;
  disputeWindowSeconds(): Promise<number>;
  /** Resolves when the call would succeed; throws the escrow's refusal when it would revert. */
  simulate(action: KeeperAction, jobId: string): Promise<void>;
  /** The keeper wallet's gas balance, in wei. */
  balance(): Promise<bigint>;
  /** The keeper wallet's next nonce, counting its pending transactions. */
  nonce(): Promise<number>;
  send(action: KeeperAction, jobId: string, nonce: number): Promise<`0x${string}`>;
  /** 'unknown' when no receipt arrived in time; the next run reads the job again. */
  confirm(hash: `0x${string}`): Promise<'success' | 'reverted' | 'unknown'>;
  /** Writes the transaction to the index and returns the job's status after it. */
  record(jobId: string, action: KeeperAction, hash: `0x${string}`): Promise<string | null>;
}

export interface KeeperRunOptions {
  mode: 'dry' | 'on';
  /** The most transactions one run sends on one chain. */
  maxSends: number;
  /** Below this balance nothing is sent: a send that runs out of gas halfway through a run helps nobody. */
  minBalance: bigint;
  /** Nothing new starts at or after this moment, in milliseconds. */
  deadlineAt?: number;
  clock?: () => number;
}

export type KeeperResult =
  /** Dry run: the escrow would accept it. */
  | 'would-send'
  /** Sent and mined. */
  | 'confirmed'
  /** Sent, with no receipt yet. */
  | 'sent'
  /** Sent and mined, and the escrow reverted it anyway: someone else got there between the simulation and the send. */
  | 'reverted'
  /** The simulation said the escrow would refuse it, so it was not sent. */
  | 'refused'
  /** The send itself failed. */
  | 'failed';

export interface KeeperJobOutcome {
  jobId: string;
  action: KeeperAction;
  amount: string;
  result: KeeperResult;
  pastDeadline?: boolean;
  hash?: `0x${string}`;
  /** The escrow's status after a confirmed send: COMPLETED or REJECTED for a settle, EXPIRED for a refund. */
  after?: string | null;
  reason?: string;
}

export interface KeeperChainOutcome {
  chainId: KeeperChain;
  mode: 'dry' | 'on';
  /** Jobs read from the escrow this run. */
  checked: number;
  /** Jobs that could not be read; they are read again next run. */
  unread: number;
  /** Jobs still inside their review window or deadline. */
  waiting: number;
  /** Jobs the escrow owes an action now. */
  due: number;
  outcomes: KeeperJobOutcome[];
  /** Why the run stopped before acting on every due job, when it did. */
  stopped: 'cap' | 'deadline' | 'gas' | 'send-error' | null;
  error?: string;
}

/*
 * The escrow's refusals that have been decoded, so a report says what
 * happened rather than printing four bytes. Anything else is passed through
 * as its selector.
 */
const REFUSALS: Record<string, string> = {
  '0x17be5b7b': 'the review window has not closed',
  '0x8e78f0cb': 'the job is not in a state that allows it',
  '0x32d53d69': 'the job has no dispute policy, so it can never settle',
};

export function describeRefusal(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const selector = text.match(/0x[0-9a-f]{8}\b/i)?.[0]?.toLowerCase();
  if (selector) return REFUSALS[selector] ? `${REFUSALS[selector]} (${selector})` : selector;
  return text.split('\n')[0].slice(0, 160);
}

export async function runKeeperChain(deps: KeeperChainDeps, options: KeeperRunOptions): Promise<KeeperChainOutcome> {
  const clock = options.clock ?? Date.now;
  const open = () => options.deadlineAt === undefined || clock() < options.deadlineAt;
  const outcome: KeeperChainOutcome = { chainId: deps.chainId, mode: options.mode, checked: 0, unread: 0, waiting: 0, due: 0, outcomes: [], stopped: null };

  let context: { disputeWindowSeconds: number; now: number };
  try {
    const [disputeWindowSeconds, now] = await Promise.all([deps.disputeWindowSeconds(), deps.chainNow()]);
    context = { disputeWindowSeconds, now };
  } catch (error) {
    return { ...outcome, error: `could not read the escrow's clock or review window: ${describeRefusal(error)}` };
  }

  const seen = new Set<string>();
  const candidates = deps.candidates.filter((candidate) => !seen.has(candidate.jobId) && Boolean(seen.add(candidate.jobId)));

  const read = await mapWithConcurrency(candidates, 4, async (candidate) => {
    if (!open()) return { candidate, plan: null, reached: false };
    try {
      return { candidate, plan: planKeeperJob(await deps.readJob(candidate.jobId), context), reached: true };
    } catch {
      return { candidate, plan: null, reached: true };
    }
  });

  const due: Array<{ candidate: KeeperCandidate; plan: Extract<KeeperPlan, { action: KeeperAction }> }> = [];
  for (const { candidate, plan, reached } of read) {
    if (!reached) {
      outcome.stopped = 'deadline';
      continue;
    }
    if (!plan) {
      outcome.unread += 1;
      continue;
    }
    outcome.checked += 1;
    if (plan.action === 'wait') outcome.waiting += 1;
    if (plan.action === 'settle' || plan.action === 'refund') due.push({ candidate, plan });
  }
  outcome.due = due.length;
  if (due.length === 0) return outcome;

  const base = (candidate: KeeperCandidate, plan: (typeof due)[number]['plan']) => ({
    jobId: candidate.jobId,
    action: plan.action,
    amount: candidate.amount,
    ...(plan.action === 'settle' ? { pastDeadline: plan.pastDeadline } : {}),
  });

  if (options.mode === 'dry') {
    for (const { candidate, plan } of due) {
      if (!open()) {
        outcome.stopped = 'deadline';
        break;
      }
      try {
        await deps.simulate(plan.action, candidate.jobId);
        outcome.outcomes.push({ ...base(candidate, plan), result: 'would-send' });
      } catch (error) {
        outcome.outcomes.push({ ...base(candidate, plan), result: 'refused', reason: describeRefusal(error) });
      }
    }
    return outcome;
  }

  let nonce: number;
  try {
    const balance = await deps.balance();
    if (balance < options.minBalance) return { ...outcome, stopped: 'gas' };
    nonce = await deps.nonce();
  } catch (error) {
    return { ...outcome, error: `could not read the keeper wallet: ${describeRefusal(error)}` };
  }

  let sent = 0;
  for (const { candidate, plan } of due) {
    if (sent >= options.maxSends) {
      outcome.stopped = 'cap';
      break;
    }
    if (!open()) {
      outcome.stopped = 'deadline';
      break;
    }
    /*
     * Simulated immediately before each send, not once for the batch: the
     * agent, the buyer or another keeper may have acted on the job since it
     * was read, and a call that reverts would only spend gas.
     */
    try {
      await deps.simulate(plan.action, candidate.jobId);
    } catch (error) {
      outcome.outcomes.push({ ...base(candidate, plan), result: 'refused', reason: describeRefusal(error) });
      continue;
    }
    let hash: `0x${string}`;
    try {
      hash = await deps.send(plan.action, candidate.jobId, nonce);
    } catch (error) {
      /*
       * Stopped rather than carried on. Whether the failed send used its
       * nonce is not known, and sending the next job on a guessed nonce
       * either collides or leaves a gap that stalls everything after it.
       */
      outcome.outcomes.push({ ...base(candidate, plan), result: 'failed', reason: describeRefusal(error) });
      outcome.stopped = 'send-error';
      break;
    }
    nonce += 1;
    sent += 1;
    const status = await deps.confirm(hash).catch(() => 'unknown' as const);
    if (status === 'success') {
      const after = await deps.record(candidate.jobId, plan.action, hash).catch(() => null);
      outcome.outcomes.push({ ...base(candidate, plan), result: 'confirmed', hash, after });
    } else if (status === 'reverted') {
      outcome.outcomes.push({ ...base(candidate, plan), result: 'reverted', hash });
    } else {
      outcome.outcomes.push({ ...base(candidate, plan), result: 'sent', hash, reason: 'no receipt yet; the next run reads the job again' });
    }
  }
  return outcome;
}

/**
 * The run in a phrase, for the log: "56: 1 settled; 97: 2 would refund".
 * Empty when nothing was due anywhere, so a quiet run adds nothing to the
 * scheduler's line.
 */
export function keeperSummary(chains: readonly KeeperChainOutcome[]): string {
  const parts = chains
    .map((chain) => {
      const count = (predicate: (outcome: KeeperJobOutcome) => boolean) => chain.outcomes.filter(predicate).length;
      const phrases = [
        [count((o) => o.result === 'confirmed' && o.action === 'settle'), 'settled'],
        [count((o) => o.result === 'confirmed' && o.action === 'refund'), 'refunded'],
        [count((o) => o.result === 'sent'), 'sent, unconfirmed'],
        [count((o) => o.result === 'would-send' && o.action === 'settle'), 'would settle'],
        [count((o) => o.result === 'would-send' && o.action === 'refund'), 'would refund'],
        [count((o) => o.result === 'refused'), 'refused'],
        [count((o) => o.result === 'reverted' || o.result === 'failed'), 'failed'],
      ]
        .filter(([n]) => (n as number) > 0)
        .map(([n, label]) => `${n} ${label}`);
      if (chain.error) phrases.push(chain.error);
      if (chain.stopped) phrases.push(`stopped: ${chain.stopped}`);
      return phrases.length > 0 ? `${chain.chainId}: ${phrases.join(', ')}` : null;
    })
    .filter(Boolean);
  return parts.join('; ');
}
