import { fundingOutcome, type FundedJobFields } from './funding-outcome';

/**
 * A funding attempt, written down before the wallet is asked and kept until
 * the chain says how it ended.
 *
 * The hire flow used to hold the attempt in memory only. A wallet that
 * stopped reporting, a receipt that timed out, a token read that failed after
 * the money moved, or simply a reload, all left the buyer on an error with a
 * retry beside it — and a retry after a funding that landed is a second job
 * and a second payment. So:
 *
 * - the attempt is persisted (per wallet and chain) before the first prompt,
 *   and every identifier is added the moment it exists: the predicted job id,
 *   the batch id, each transaction hash, the real job id;
 * - while one is open, no new commission from that wallet starts (`begin`
 *   refuses), across clicks, tabs and reloads;
 * - it is closed only by a definite answer: funded (the job is adopted, never
 *   re-funded), or not funded (nothing moved). Anything else is pending
 *   reconciliation, said as that, and checked again — never shown as a failed
 *   hire to be retried.
 */
export interface FundingAttempt {
  wallet: string;
  chainId: number;
  provider: string;
  agent: { chainId: number; tokenId: string; name: string };
  /** The brief as the agent reads it, and the description committed on chain. */
  task: string;
  description: string;
  /** The token and exact amount this attempt funds. */
  token: string;
  amountRaw: string;
  expiredAt: string | null;
  startedAt: string;
  updatedAt: string;
  predictedJobId: string | null;
  jobId: string | null;
  callsId: string | null;
  txHashes: string[];
  /** `sending` while this page is driving it; `pending` once it ended without a definite answer. */
  state: 'sending' | 'pending';
}

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const storageKey = (wallet: string, chainId: number) => `pokter:funding-attempt:${chainId}:${wallet.toLowerCase()}`;

export function fundingJournal(kv: KeyValue) {
  const read = (wallet: string, chainId: number): FundingAttempt | null => {
    try {
      const raw = kv.getItem(storageKey(wallet, chainId));
      return raw ? (JSON.parse(raw) as FundingAttempt) : null;
    } catch {
      return null;
    }
  };
  const write = (attempt: FundingAttempt) => kv.setItem(storageKey(attempt.wallet, attempt.chainId), JSON.stringify(attempt));
  return {
    read,
    /** Open an attempt, or refuse while another from this wallet is unresolved. */
    begin(attempt: Omit<FundingAttempt, 'state' | 'updatedAt' | 'txHashes' | 'jobId' | 'callsId'> & Partial<Pick<FundingAttempt, 'jobId' | 'callsId' | 'txHashes'>>): { ok: true; attempt: FundingAttempt } | { ok: false; blocking: FundingAttempt } {
      const open = read(attempt.wallet, attempt.chainId);
      if (open) return { ok: false, blocking: open };
      const full: FundingAttempt = { jobId: null, callsId: null, txHashes: [], ...attempt, state: 'sending', updatedAt: attempt.startedAt };
      write(full);
      return { ok: true, attempt: full };
    },
    /** Add what is now known. A hash is appended once; nothing already known is erased. */
    note(wallet: string, chainId: number, patch: { predictedJobId?: string; jobId?: string; callsId?: string; txHash?: string; state?: FundingAttempt['state'] }, at: string = new Date().toISOString()): FundingAttempt | null {
      const open = read(wallet, chainId);
      if (!open) return null;
      const next: FundingAttempt = {
        ...open,
        predictedJobId: patch.predictedJobId ?? open.predictedJobId,
        jobId: patch.jobId ?? open.jobId,
        callsId: patch.callsId ?? open.callsId,
        txHashes: patch.txHash && !open.txHashes.includes(patch.txHash) ? [...open.txHashes, patch.txHash] : open.txHashes,
        state: patch.state ?? open.state,
        updatedAt: at,
      };
      write(next);
      return next;
    },
    close(wallet: string, chainId: number) {
      kv.removeItem(storageKey(wallet, chainId));
    },
  };
}

/** Whether nothing could have left the wallet: no hash, no batch, no job id ever reported. */
export function nothingSent(attempt: FundingAttempt): boolean {
  return attempt.txHashes.length === 0 && attempt.callsId === null && attempt.jobId === null;
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

export type Reconciled =
  | { outcome: 'funded'; jobId: string }
  | { outcome: 'not-funded'; jobId: string | null; detail: string }
  | { outcome: 'mismatch'; jobId: string; detail: string }
  | { outcome: 'pending'; detail: string };

/** How far past the predicted id to look: other buyers' hires can take the ids in between. */
export const RECONCILE_WINDOW = 6;
/** How long a transaction may stay unseen before "not mined" is read as "never sent". */
export const UNSEEN_GRACE_MS = 15 * 60_000;

const OPEN = new Set(['OPEN', 'CREATED']);

/**
 * Ask the chain how an attempt ended. Only `funded` and `not-funded` close
 * it; the rest keep it open and keep further commissions blocked.
 */
export async function reconcileAttempt(attempt: FundingAttempt, read: AttemptChainReader, nowMs: number = Date.now()): Promise<Reconciled> {
  const expected = { account: attempt.wallet, provider: attempt.provider, budget: BigInt(attempt.amountRaw), description: attempt.description };
  let jobId = attempt.jobId;
  let unmined = 0;
  let reverted = 0;
  for (const hash of attempt.txHashes) {
    const receipt = await read.receipt(hash).catch(() => null);
    if (!receipt) {
      unmined += 1;
      continue;
    }
    if (receipt.status === 'reverted') reverted += 1;
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
    if (batch?.status === 'failure') reverted += 1;
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
    if (jobId) {
      /* Our job, created and not funded. Funded later only if a transaction is still in flight. */
      if (unmined > 0) return { outcome: 'pending', detail: `Job ${jobId} exists and is not funded yet; a transaction from this attempt is not mined.` };
      return { outcome: 'not-funded', jobId, detail: `Job ${jobId} was created and never funded, so nothing was taken. It holds no money.` };
    }
  }

  const age = nowMs - Date.parse(attempt.startedAt);
  if (unmined > 0 && age < UNSEEN_GRACE_MS) return { outcome: 'pending', detail: 'A transaction from this attempt is not mined yet.' };
  if (nothingSent(attempt) && age >= UNSEEN_GRACE_MS) return { outcome: 'not-funded', jobId: null, detail: 'The wallet never reported a transaction, and no matching job exists.' };
  if (attempt.txHashes.length > 0 && unmined === 0 && reverted > 0) return { outcome: 'not-funded', jobId: null, detail: 'The attempt’s transactions reverted, and no matching job is funded.' };
  /* Every transaction is mined and none of them created a job for this buyer and provider: none exists to fund. */
  if (attempt.txHashes.length > 0 && unmined === 0 && !attempt.callsId) return { outcome: 'not-funded', jobId: null, detail: 'The attempt’s transactions are mined and none of them created this job.' };
  return { outcome: 'pending', detail: 'No matching funded job yet. Check your wallet activity; Pokter checks again before anything else can be funded.' };
}
