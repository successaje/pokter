import type { FundedJobFields } from './funding-outcome';

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

/** Whether a prompt can move escrow money: only a fund or a batch can. */
export function promptMovesMoney(step: PromptStep | null | undefined): boolean {
  return step != null && MOVES_MONEY.has(step);
}

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
  /** The server's id for this attempt's cross-device record, once it accepted it (`remote-attempts`). */
  remotePublicId?: string | null;
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

/**
 * A prompt that could move money was about to be issued without the deadline
 * encoded in its calls being recorded first. Refused before the wallet is
 * asked: an attempt whose expiry is unknown could never be proven harmless,
 * and would hold the wallet forever.
 */
export class DeadlineNotRecorded extends Error {
  constructor() {
    super('DEADLINE_NOT_RECORDED');
    this.name = 'DeadlineNotRecorded';
  }
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
  note(patch: { predictedJobId?: string; jobId?: string; callsId?: string; txHash?: string; fundableUntil?: number; description?: string; remotePublicId?: string }): FundingAttempt;
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
  | { ok: false; reason: 'open-attempt'; blocking: FundingAttempt }
  | { ok: false; reason: 'already-funded'; jobId: string };

/**
 * A batch's id from what `wallet_sendCalls` returned.
 *
 * Pokter asks for version 2.0.0 of the batch call, which answers with an
 * object, `{ id }`; version 1 answered with the id itself. The answer was
 * cast to a string and stored whole, so the object reached
 * `wallet_getCallsStatus`, which could not read it, and a batch that had
 * paid ended as an unclear attempt. Its pending notice then called
 * `.slice` on the object and the hire page crashed, on every visit, for as
 * long as the record stayed in the browser (31 October, BNB Chain).
 */
export function batchId(value: unknown): string | null {
  if (typeof value === 'string') return value || null;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') return (value as { id: string }).id || null;
  return null;
}

export function fundingCoordinator(kv: KeyValue, locks: LockManagerLike | null, tabId: string, now: () => Date = () => new Date()) {
  /*
   * Read through `batchId`, so a record stored with the whole answer as its
   * batch id is repaired on read: the page renders, and the attempt can be
   * settled against the wallet and the chain like any other.
   */
  const read = (wallet: string, chainId: number): FundingAttempt | null => {
    try {
      const raw = kv.getItem(storageKey(wallet, chainId));
      if (!raw) return null;
      const stored = JSON.parse(raw) as FundingAttempt;
      return { ...stored, callsId: batchId(stored.callsId), txHashes: Array.isArray(stored.txHashes) ? stored.txHashes.filter((h) => typeof h === 'string') : [] };
    } catch {
      return null;
    }
  };
  const write = (attempt: FundingAttempt) => kv.setItem(storageKey(attempt.wallet, attempt.chainId), JSON.stringify(attempt));
  /*
   * Every job this wallet funded through an attempt, by the attempt's exact
   * description (brief plus signed quote). A later attempt with the same
   * description is refused: the same signed quote is never paid twice, even
   * after its record closed (a wrong-amount job included).
   */
  const fundedKey = (wallet: string, chainId: number) => `pokter:funded-attempts:${chainId}:${wallet.toLowerCase()}`;
  const fundedList = (wallet: string, chainId: number): Array<{ hash: string; jobId: string; until: number | null }> => {
    try {
      const raw = kv.getItem(fundedKey(wallet, chainId));
      return raw ? (JSON.parse(raw) as Array<{ hash: string; jobId: string; until: number | null }>) : [];
    } catch {
      return [];
    }
  };
  const rememberFunded = (attempt: Pick<FundingAttempt, 'wallet' | 'chainId' | 'description' | 'fundableUntil'>, jobId: string) => {
    const nowSeconds = Math.floor(now().getTime() / 1000);
    /* Kept while the quote's job could still be created or funded; never more than 50 entries. */
    const kept = fundedList(attempt.wallet, attempt.chainId).filter((e) => e.until === null || e.until > nowSeconds).slice(-49);
    kv.setItem(fundedKey(attempt.wallet, attempt.chainId), JSON.stringify([...kept, { hash: descriptionHash(attempt.description), jobId, until: attempt.fundableUntil }]));
  };
  const alreadyFunded = (wallet: string, chainId: number, description: string) =>
    fundedList(wallet, chainId).find((e) => e.hash === descriptionHash(description)) ?? null;
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

  const sessionFor = (wallet: string, chainId: number, attemptId: string): AttemptSession => {
    const mine = (): FundingAttempt => {
      const current = read(wallet, chainId);
      if (!current || current.attemptId !== attemptId) throw new AttemptOwnershipLost();
      return current;
    };
    const update = (next: FundingAttempt) => {
      write({ ...next, updatedAt: now().toISOString() });
      return read(wallet, chainId)!;
    };
    return {
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
          remotePublicId: patch.remotePublicId ?? current.remotePublicId ?? null,
          txHashes: patch.txHash && !current.txHashes.includes(patch.txHash) ? [...current.txHashes, patch.txHash] : current.txHashes,
        });
      },
      beforePrompt(step) {
        const current = mine();
        if (MOVES_MONEY.has(step) && current.fundableUntil === null) throw new DeadlineNotRecorded();
        return update({ ...current, prompt: step });
      },
      close() {
        const current = read(wallet, chainId);
        if (current?.attemptId !== attemptId) return;
        /* `close` is the owner's "funded and recorded": the quote is spent. */
        if (current.jobId) rememberFunded(current, current.jobId);
        remove(wallet, chainId);
      },
      leavePending() {
        const current = read(wallet, chainId);
        if (current?.attemptId !== attemptId) return null;
        return update({ ...current, state: 'pending' });
      },
    };
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
        const funded = alreadyFunded(input.wallet, input.chainId, input.description);
        if (funded) return { ok: false, reason: 'already-funded', jobId: funded.jobId };
        const at = now().toISOString();
        const attemptId = `${tabId}:${at}:${Math.random().toString(36).slice(2, 10)}`;
        const attempt: FundingAttempt = { ...input, fundableUntil: input.fundableUntil ?? null, attemptId, ownerTab: tabId, state: 'sending', updatedAt: at, txHashes: [], jobId: null, callsId: null, prompt: null };
        write(attempt);
        const session = sessionFor(input.wallet, input.chainId, attemptId);
        return { ok: true, value: await drive(session) };
      };
      if (!locks) return go();
      const held = await exclusive(input.wallet, input.chainId, go);
      return held.held ? held.value : { ok: false, reason: 'in-progress-elsewhere' };
    },

    /**
     * Take over an attempt whose owner is gone, to finish it rather than start
     * another: the safe recovery for a created, unfunded job. Under the lock,
     * only if the record is still exactly `snapshot`; the session then drives
     * it like a new attempt (ownership checked before every prompt).
     */
    async resume<T>(snapshot: FundingAttempt, drive: (session: AttemptSession) => Promise<T>): Promise<RunResult<T> | { ok: false; reason: 'stale' }> {
      const go = async (): Promise<RunResult<T> | { ok: false; reason: 'stale' }> => {
        const current = read(snapshot.wallet, snapshot.chainId);
        if (!current || current.attemptId !== snapshot.attemptId || current.updatedAt !== snapshot.updatedAt) return { ok: false, reason: 'stale' };
        const attemptId = `${tabId}:${now().toISOString()}:resume`;
        write({ ...current, attemptId, ownerTab: tabId, state: 'sending', updatedAt: now().toISOString() });
        return { ok: true, value: await drive(sessionFor(snapshot.wallet, snapshot.chainId, attemptId)) };
      };
      if (!locks) return go();
      const held = await exclusive(snapshot.wallet, snapshot.chainId, go);
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
    ): Promise<'closed-funded' | 'closed-not-funded' | 'closed-mismatch' | 'kept' | 'kept-may-still-pay' | 'busy' | 'stale'> {
      const held = await exclusive(snapshot.wallet, snapshot.chainId, async () => {
        const current = read(snapshot.wallet, snapshot.chainId);
        if (!current || current.attemptId !== snapshot.attemptId || current.updatedAt !== snapshot.updatedAt) return 'stale' as const;
        if (verdict.outcome === 'funded') {
          await onFunded?.(verdict.jobId);
          rememberFunded(current, verdict.jobId);
          remove(snapshot.wallet, snapshot.chainId);
          return 'closed-funded' as const;
        }
        if (verdict.outcome === 'not-funded') {
          if (!paymentImpossible(withProvenDeadline(current, verdict), chainNowSeconds)) return 'kept-may-still-pay' as const;
          remove(snapshot.wallet, snapshot.chainId);
          return 'closed-not-funded' as const;
        }
        /*
         * Money moved, into this attempt's job, under terms that differ. It is
         * shown, never funded again, and no longer blocks the wallet: nothing
         * more can be paid into a job that is already funded.
         */
        if (verdict.outcome === 'mismatch') {
          /*
           * The job is funded and is kept: adopted and recorded exactly as the
           * chain holds it (its real amount), and its quote is marked spent so
           * it can never be paid again. Only then does the record stop
           * blocking: nothing more can be paid into a funded job.
           */
          await onFunded?.(verdict.jobId);
          rememberFunded(current, verdict.jobId);
          remove(snapshot.wallet, snapshot.chainId);
          return 'closed-mismatch' as const;
        }
        /* Past the deadline encoded in this attempt's own calls, nothing in flight can fund or create its job: the escrow refuses both. */
        if (pastFundable(current, chainNowSeconds)) {
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
  return pastFundable(attempt, chainNowSeconds);
}

/**
 * Whether the chain is past the deadline encoded in this attempt's own calls
 * (or read from its job on chain), after which the escrow refuses to create
 * or fund the job. Never inferred from elapsed time: an attempt whose
 * deadline is unknown is never past. A money-moving prompt cannot be issued
 * without one (`DeadlineNotRecorded`), so such an attempt has nothing in
 * flight that could pay.
 */
export function pastFundable(attempt: Pick<FundingAttempt, 'fundableUntil'>, chainNowSeconds: number): boolean {
  return attempt.fundableUntil !== null && chainNowSeconds > attempt.fundableUntil;
}

/** The attempt with its deadline proven by the chain when its own record lacks one: the job's on-chain `expiredAt`. */
/**
 * The job an attempt created and left unfunded, when it can still be
 * finished: not funded, and before the deadline the escrow holds for it.
 *
 * Such an attempt was closed as "not funded" whenever no funding prompt had
 * gone out, which is right about money (nothing in flight can pay) and left
 * the job behind: after a reload the buyer started a second job instead of
 * finishing the first. It is kept and offered for finishing instead.
 */
export function finishableJob(attempt: Pick<FundingAttempt, 'fundableUntil'>, verdict: Reconciled, chainNowSeconds: number): string | null {
  if (verdict.outcome !== 'not-funded' || !verdict.jobId) return null;
  return pastFundable(withProvenDeadline(attempt, verdict), chainNowSeconds) ? null : verdict.jobId;
}

function withProvenDeadline<A extends Pick<FundingAttempt, 'fundableUntil'>>(attempt: A, verdict: Reconciled): A {
  if (attempt.fundableUntil !== null || verdict.outcome !== 'not-funded' || verdict.expiredAt == null) return attempt;
  return { ...attempt, fundableUntil: verdict.expiredAt };
}

/** A short, stable key for a description (FNV-1a, 53 bits); a collision can only refuse a hire, never allow one. */
export function descriptionHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export interface AttemptChainReader {
  /** A mined receipt's status and logs, or null while it is not mined (or unknown to the node). */
  receipt(hash: string): Promise<{ status: 'success' | 'reverted'; logs: unknown[] } | null>;
  /**
   * For a hash with no receipt: still pending, replaced (another transaction
   * from the same account took its nonce: sped up, cancelled or dropped and
   * superseded), or unknown to the node. Optional; without it every hash
   * with no receipt counts as in flight.
   */
  txState?(hash: string): Promise<'pending' | 'replaced' | 'unknown'>;
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
  | { outcome: 'not-funded'; jobId: string | null; detail: string; expiredAt?: number | null }
  | { outcome: 'mismatch'; jobId: string; detail: string }
  | { outcome: 'pending'; detail: string };

/** How far past the predicted id to look: other buyers' hires can take the ids in between. */
export const RECONCILE_WINDOW = 6;

const OPEN = new Set(['OPEN', 'CREATED']);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function reconcileAttempt(attempt: FundingAttempt, read: AttemptChainReader): Promise<Reconciled> {
  const expected = { account: attempt.wallet, provider: attempt.provider, budget: BigInt(attempt.amountRaw), description: attempt.description };
  let jobId = attempt.jobId;
  let unmined = 0;
  for (const hash of attempt.txHashes) {
    const receipt = await read.receipt(hash).catch(() => null);
    if (!receipt) {
      /*
       * A replaced transaction will never be mined under this hash; its nonce
       * went to another (whose effect, if it funded, is found by the job
       * reads below). Pending or unknown still counts as in flight.
       */
      const state = read.txState ? await read.txState(hash).catch(() => 'unknown' as const) : 'unknown';
      if (state !== 'replaced') unmined += 1;
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
  /*
   * Each candidate is judged as *this attempt's* job: the same client,
   * provider and description (the description carries the brief and the
   * signed quote, so another hire of the same agent never matches). A job
   * that is still open holds no money whatever its budget says — `createJob`
   * starts at budget 0 and `setBudget` comes later — so it is unfunded and
   * resumable, never a mismatch. Only a job past OPEN in a different amount is.
   */
  let openJob: string | null = null;
  let openExpiredAt: number | null = null;
  for (const id of candidates) {
    let onchain: FundedJobFields | null;
    try {
      onchain = await read.job(id);
    } catch {
      return { outcome: 'pending', detail: 'The escrow could not be read just now.' };
    }
    if (!onchain || !onchain.client || /^0x0{40}$/i.test(onchain.client)) continue;
    const ours = same(onchain.client, expected.account) && same(onchain.provider, expected.provider) && onchain.description === expected.description;
    if (!ours) continue;
    if (OPEN.has(onchain.statusName)) {
      if (openJob === null) {
        openJob = id.toString();
        openExpiredAt = onchain.expiredAt !== undefined ? Number(onchain.expiredAt) : null;
      }
      continue;
    }
    if (onchain.budget === expected.budget) return { outcome: 'funded', jobId: id.toString() };
    return { outcome: 'mismatch', jobId: id.toString(), detail: `Job ${id} from this wallet was funded with an amount that differs from this attempt. It is not funded again; open the job and check it.` };
  }
  if (unmined > 0) return { outcome: 'pending', detail: 'A transaction from this attempt is not mined yet.' };
  jobId = openJob ?? jobId;
  return {
    outcome: 'not-funded',
    jobId,
    expiredAt: openExpiredAt,
    detail: jobId ? `Job ${jobId} exists and is not funded.` : 'No funded job from this attempt exists.',
  };
}
