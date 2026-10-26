import { fundingOutcome, type FundedJobFields } from './funding-outcome';

/**
 * A funding attempt, owned by the tab that drives it, written down before the
 * wallet is asked, and closed only when the chain proves how it ended.
 *
 * Why ownership, not just a record. A record in shared storage can be read by
 * any tab. Without an owner, a second tab could reconcile an attempt the first
 * was still driving — see a created job still OPEN, every recorded transaction
 * mined, call it "not funded" and clear it — while the first tab sat at the
 * approve or fund prompt and could still pay. The second tab could then start
 * another hire. An OPEN job proves only that nothing has been funded *yet*.
 *
 * So:
 * - The driving tab holds an exclusive cross-tab lock (Web Locks) for the
 *   wallet and chain for the whole attempt. The browser releases it when the
 *   tab ends, which is the only liveness signal trusted here.
 * - `run` refuses to begin while the lock is held elsewhere, or while any
 *   attempt is recorded: concurrent starts cannot both begin.
 * - Before every wallet request the driver calls `beforePrompt(step)`, which
 *   checks the record is still this attempt (`attemptId`) and records the
 *   prompt now outstanding. A lost or replaced record stops the flow before
 *   the wallet is asked.
 * - `settle` closes an attempt only while holding the lock (so never while its
 *   owner is alive) and only if the record is exactly the snapshot that was
 *   reconciled (so a stale result cannot delete a newer attempt).
 * - An abandoned attempt (lock free, owner gone) is closed as not funded only
 *   when no payment can follow: no prompt that moves money was outstanding,
 *   or the chain's clock is past the expiry the attempt encoded, after which
 *   the escrow refuses both `fund` and `createJobWithToken`. A timeout alone
 *   proves nothing; a funding prompt left open in a wallet can still be
 *   approved.
 */

/** The wallet request a driver is waiting on. `funding` and `batch` move money; the rest do not. */
export type PromptStep = 'swapping' | 'creating' | 'registering' | 'budgeting' | 'approving' | 'funding' | 'batch';
const MOVES_MONEY: ReadonlySet<PromptStep> = new Set(['funding', 'batch']);

export interface FundingAttempt {
  /** This attempt, distinct from any earlier or later one for the same wallet. */
  attemptId: string;
  /** The tab that created it. Informational: the lock, not this field, decides who may act. */
  ownerTab: string;
  wallet: string;
  chainId: number;
  provider: string;
  agent: { chainId: number; tokenId: string; name: string };
  task: string;
  description: string;
  token: string;
  amountRaw: string;
  /**
   * The latest chain time (seconds) any request of this attempt could still
   * fund a job: the expiry encoded in it. Past it, `fund` and creation revert.
   * Null while not yet known, which is treated as "could still pay".
   */
  fundableUntil: number | null;
  startedAt: string;
  updatedAt: string;
  predictedJobId: string | null;
  jobId: string | null;
  callsId: string | null;
  txHashes: string[];
  /** The most recent wallet request issued. Null before the first prompt. */
  prompt: PromptStep | null;
  state: 'sending' | 'pending';
}

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The subset of the Web Locks API this needs; injectable, so two tabs can be simulated deterministically. */
export interface LockManagerLike {
  request<T>(name: string, options: { ifAvailable: true }, callback: (lock: unknown | null) => Promise<T> | T): Promise<T>;
}

export class AttemptOwnershipLost extends Error {
  constructor() {
    super('ATTEMPT_OWNERSHIP_LOST');
    this.name = 'AttemptOwnershipLost';
  }
}

const storageKey = (wallet: string, chainId: number) => `pokter:funding-attempt:${chainId}:${wallet.toLowerCase()}`;
const lockName = (wallet: string, chainId: number) => `pokter:funding-lock:${chainId}:${wallet.toLowerCase()}`;

export type BeginInput = Omit<FundingAttempt, 'attemptId' | 'ownerTab' | 'state' | 'updatedAt' | 'txHashes' | 'jobId' | 'callsId' | 'prompt' | 'fundableUntil'> & { fundableUntil?: number | null };

export interface AttemptSession {
  readonly attemptId: string;
  /** Add what is now known. Throws `AttemptOwnershipLost` if the record is no longer this attempt. */
  note(patch: { predictedJobId?: string; jobId?: string; callsId?: string; txHash?: string; fundableUntil?: number; description?: string }): FundingAttempt;
  /** Call before every wallet request. Throws `AttemptOwnershipLost` if the record is no longer this attempt. */
  beforePrompt(step: PromptStep): FundingAttempt;
  /** The attempt resolved as funded and recorded by its owner. */
  close(): void;
  /** The attempt ended without a definite answer: keep it, as pending. */
  leavePending(): FundingAttempt | null;
}

export type RunResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'in-progress-elsewhere' }
  | { ok: false; reason: 'open-attempt'; blocking: FundingAttempt };

export function fundingCoordinator(kv: KeyValue, locks: LockManagerLike | null, tabId: string, now: () => Date = () => new Date()) {
  const read = (wallet: string, chainId: number): FundingAttempt | null => {
    try {
      const raw = kv.getItem(storageKey(wallet, chainId));
      return raw ? (JSON.parse(raw) as FundingAttempt) : null;
    } catch {
      return null;
    }
  };
  const write = (attempt: FundingAttempt) => kv.setItem(storageKey(attempt.wallet, attempt.chainId), JSON.stringify(attempt));
  const remove = (wallet: string, chainId: number) => kv.removeItem(storageKey(wallet, chainId));
  /*
   * Without Web Locks there is no trustworthy cross-tab liveness signal, so
   * nothing is ever closed on another's behalf: `settle` reports busy, and an
   * attempt closes only through its own tab or a funded adoption by the owner.
   */
  const exclusive = async <T>(wallet: string, chainId: number, fn: () => Promise<T>): Promise<{ held: true; value: T } | { held: false }> => {
    if (!locks) return { held: false };
    return locks.request(lockName(wallet, chainId), { ifAvailable: true }, async (lock) => (lock ? { held: true as const, value: await fn() } : { held: false as const }));
  };

  return {
    read,

    /**
     * Run one funding attempt while owning it. `drive` is called with a
     * session only after the lock is taken and the attempt is recorded; the
     * lock is held until `drive` settles, success or failure.
     */
    async run<T>(input: BeginInput, drive: (session: AttemptSession) => Promise<T>): Promise<RunResult<T>> {
      const go = async (): Promise<RunResult<T>> => {
        const open = read(input.wallet, input.chainId);
        if (open) return { ok: false, reason: 'open-attempt', blocking: open };
        const at = now().toISOString();
        const attemptId = `${tabId}:${at}:${Math.random().toString(36).slice(2, 10)}`;
        const attempt: FundingAttempt = { ...input, fundableUntil: input.fundableUntil ?? null, attemptId, ownerTab: tabId, state: 'sending', updatedAt: at, txHashes: [], jobId: null, callsId: null, prompt: null };
        write(attempt);
        const mine = (): FundingAttempt => {
          const current = read(input.wallet, input.chainId);
          if (!current || current.attemptId !== attemptId) throw new AttemptOwnershipLost();
          return current;
        };
        const update = (next: FundingAttempt) => {
          write({ ...next, updatedAt: now().toISOString() });
          return read(input.wallet, input.chainId)!;
        };
        const session: AttemptSession = {
          attemptId,
          note(patch) {
            const current = mine();
            return update({
              ...current,
              predictedJobId: patch.predictedJobId ?? current.predictedJobId,
              jobId: patch.jobId ?? current.jobId,
              callsId: patch.callsId ?? current.callsId,
              fundableUntil: patch.fundableUntil ?? current.fundableUntil,
              description: patch.description ?? current.description,
              txHashes: patch.txHash && !current.txHashes.includes(patch.txHash) ? [...current.txHashes, patch.txHash] : current.txHashes,
            });
          },
          beforePrompt(step) {
            return update({ ...mine(), prompt: step });
          },
          close() {
            const current = read(input.wallet, input.chainId);
            if (current?.attemptId === attemptId) remove(input.wallet, input.chainId);
          },
          leavePending() {
            const current = read(input.wallet, input.chainId);
            if (current?.attemptId !== attemptId) return null;
            return update({ ...current, state: 'pending' });
          },
        };
        return { ok: true, value: await drive(session) };
      };
      if (!locks) return go();
      const held = await exclusive(input.wallet, input.chainId, go);
      return held.held ? held.value : { ok: false, reason: 'in-progress-elsewhere' };
    },

    /**
     * Close a reconciled attempt, or keep it. Only under the lock (never
     * while its owner is alive), only if the record is still exactly
     * `snapshot`, and for "not funded" only when no payment can follow.
     * `onFunded` runs under the lock before the record is removed, so a
     * funded job is adopted exactly once.
     */
    async settle(
      snapshot: FundingAttempt,
      verdict: Reconciled,
      chainNowSeconds: number,
      onFunded?: (jobId: string) => Promise<void>,
    ): Promise<'closed-funded' | 'closed-not-funded' | 'kept' | 'kept-may-still-pay' | 'busy' | 'stale'> {
      const held = await exclusive(snapshot.wallet, snapshot.chainId, async () => {
        const current = read(snapshot.wallet, snapshot.chainId);
        if (!current || current.attemptId !== snapshot.attemptId || current.updatedAt !== snapshot.updatedAt) return 'stale' as const;
        if (verdict.outcome === 'funded') {
          await onFunded?.(verdict.jobId);
          remove(snapshot.wallet, snapshot.chainId);
          return 'closed-funded' as const;
        }
        if (verdict.outcome === 'not-funded') {
          if (!paymentImpossible(current, chainNowSeconds)) return 'kept-may-still-pay' as const;
          remove(snapshot.wallet, snapshot.chainId);
          return 'closed-not-funded' as const;
        }
        return 'kept' as const;
      });
      return held.held ? held.value : 'busy';
    },
  };
}

/**
 * Whether an attempt whose owner is gone can no longer pay: no request that
 * moves money was ever issued, or the chain is past the expiry it encoded.
 */
export function paymentImpossible(attempt: Pick<FundingAttempt, 'prompt' | 'fundableUntil'>, chainNowSeconds: number): boolean {
  if (attempt.prompt === null || !MOVES_MONEY.has(attempt.prompt)) return true;
  return attempt.fundableUntil !== null && chainNowSeconds > attempt.fundableUntil;
}

export interface AttemptChainReader {
  /** A mined receipt's status and logs, or null while it is not mined (or unknown to the node). */
  receipt(hash: string): Promise<{ status: 'success' | 'reverted'; logs: unknown[] } | null>;
  /** A batch's receipts, or null when the wallet cannot say. */
  calls?(callsId: string): Promise<{ status: 'pending' | 'success' | 'failure'; logs: unknown[] } | null>;
  job(jobId: bigint): Promise<FundedJobFields | null>;
  /** The job id a set of logs created for this buyer and provider, or null. */
  jobIdFrom(logs: unknown[]): bigint | null;
}

/**
 * What the chain says about an attempt *now*. `not-funded` means only that no
 * funded job exists and nothing recorded is in flight; whether that may close
 * the attempt is `settle`'s decision, which also needs the lock and the
 * outstanding prompt.
 */
export type Reconciled =
  | { outcome: 'funded'; jobId: string }
  | { outcome: 'not-funded'; jobId: string | null; detail: string }
  | { outcome: 'mismatch'; jobId: string; detail: string }
  | { outcome: 'pending'; detail: string };

/** How far past the predicted id to look: other buyers' hires can take the ids in between. */
export const RECONCILE_WINDOW = 6;

const OPEN = new Set(['OPEN', 'CREATED']);

export async function reconcileAttempt(attempt: FundingAttempt, read: AttemptChainReader): Promise<Reconciled> {
  const expected = { account: attempt.wallet, provider: attempt.provider, budget: BigInt(attempt.amountRaw), description: attempt.description };
  let jobId = attempt.jobId;
  let unmined = 0;
  for (const hash of attempt.txHashes) {
    const receipt = await read.receipt(hash).catch(() => null);
    if (!receipt) {
      unmined += 1;
      continue;
    }
    if (!jobId) {
      const id = read.jobIdFrom(receipt.logs);
      if (id !== null) jobId = id.toString();
    }
  }
  if (!jobId && attempt.callsId && read.calls) {
    const batch = await read.calls(attempt.callsId).catch(() => null);
    if (batch?.status === 'pending') return { outcome: 'pending', detail: 'The wallet still reports the payment batch as pending.' };
    if (batch?.status === 'success') {
      const id = read.jobIdFrom(batch.logs);
      if (id !== null) jobId = id.toString();
    }
  }

  const candidates = jobId
    ? [BigInt(jobId)]
    : attempt.predictedJobId
      ? Array.from({ length: RECONCILE_WINDOW }, (_, i) => BigInt(attempt.predictedJobId!) + BigInt(i))
      : [];
  for (const id of candidates) {
    let onchain: FundedJobFields | null;
    try {
      onchain = await read.job(id);
    } catch {
      return { outcome: 'pending', detail: 'The escrow could not be read just now.' };
    }
    const verdict = fundingOutcome(onchain && { ...onchain, statusName: OPEN.has(onchain.statusName) ? 'CREATED' : onchain.statusName }, expected);
    if (verdict === 'funded') return { outcome: 'funded', jobId: id.toString() };
    if (verdict === 'mismatch') return { outcome: 'mismatch', jobId: id.toString(), detail: 'A job from this wallet to this provider exists with terms that differ from this attempt.' };
  }
  if (unmined > 0) return { outcome: 'pending', detail: 'A transaction from this attempt is not mined yet.' };
  return {
    outcome: 'not-funded',
    jobId,
    detail: jobId ? `Job ${jobId} exists and is not funded.` : 'No funded job from this attempt exists.',
  };
}
