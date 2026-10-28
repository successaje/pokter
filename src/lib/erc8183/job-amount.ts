import { getAddress } from 'viem';

import { ESCROW_PAYMENT_TOKEN, type EscrowChainId } from '@/lib/network/escrow';
import { formatAmount, paymentTokenAt } from '@/lib/network/tokens';

/**
 * A job's amount in the money it is actually in.
 *
 * Every job used to be labelled "$U" because every Pokter job was created by
 * `createJob`, which binds the escrow default. With USDT hiring that stops
 * being true, so the label comes from the job's own token: recorded at
 * funding, or read from the escrow's `jobPaymentToken` by the backfill.
 *
 * A job whose token is not known is not called $U — whatever the flags say.
 * Only a token positively identified (recorded at funding, or read from the
 * escrow) gets a label. A fallback to "$U while other tokens are off" would
 * relabel real USDT jobs the moment the flag was turned off during a
 * rollback, and corrupt every total built from them. Unknown is fixed by
 * reading the chain (the sweep and the currency backfill), never by guessing.
 */
export interface JobAmountInput {
  chainId: number;
  paymentToken?: string | null;
  budgetRaw: string;
}

const dollarUOn = (chainId: number): string | null =>
  chainId === 56 || chainId === 97 ? ESCROW_PAYMENT_TOKEN[chainId as EscrowChainId] : null;

/** The token to read a job's amount in, or null when it is not known. */
export function jobToken(job: Pick<JobAmountInput, 'chainId' | 'paymentToken'>): string | null {
  return job.paymentToken || null;
}

export function jobAmountLabel(job: JobAmountInput): string {
  const token = jobToken(job);
  if (!token) return `${job.budgetRaw} base units (currency not yet read)`;
  return formatAmount(job.chainId, token, job.budgetRaw)?.label ?? `${job.budgetRaw} base units of ${token}`;
}

export interface TokenTotal {
  chainId: number;
  /** Null for jobs whose token is not known: their own bucket, never folded into another. */
  token: string | null;
  symbol: string | null;
  decimals: number | null;
  raw: bigint;
  /** In words, with its symbol; null when the token or its scale is unknown. */
  label: string | null;
  jobs: number;
}

/**
 * Amounts summed per chain and token, never across them.
 *
 * Mainnet $U, testnet $U and USDT are three different moneys, and a single
 * "revenue" figure over them is a number about nothing. Unknown tokens get
 * their own bucket with no label, so they are counted and not converted.
 */
export function totalsByToken(jobs: JobAmountInput[]): TokenTotal[] {
  const buckets = new Map<string, TokenTotal>();
  for (const job of jobs) {
    let raw: bigint;
    try {
      raw = BigInt(job.budgetRaw);
    } catch {
      continue;
    }
    const tokenRaw = jobToken(job);
    let token: string | null = null;
    try {
      token = tokenRaw ? getAddress(tokenRaw) : null;
    } catch {
      token = null;
    }
    const key = `${job.chainId}:${token ?? 'unknown'}`;
    const known = token ? paymentTokenAt(job.chainId, token) : null;
    const bucket = buckets.get(key) ?? { chainId: job.chainId, token, symbol: known ? (known.symbol === 'U' ? '$U' : known.symbol) : null, decimals: known?.decimals ?? null, raw: 0n, label: null, jobs: 0 };
    bucket.raw += raw;
    bucket.jobs += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].map((b) => ({ ...b, label: b.token ? formatAmount(b.chainId, b.token, b.raw)?.label ?? null : null }));
}

/**
 * Whether a job counts toward a figure published as "$U": its token is known
 * to be the escrow default on its chain. Neither a USDT job nor an unknown one
 * does; both are counted in their own bucket by `totalsByToken`.
 */
export function isDollarUJob(job: Pick<JobAmountInput, 'chainId' | 'paymentToken'>): boolean {
  const token = jobToken(job);
  const dollarU = dollarUOn(job.chainId);
  return Boolean(token && dollarU && token.toLowerCase() === dollarU.toLowerCase());
}

/** `totalsByToken`, with bigints as strings, for a JSON response. */
export function serializableTotals(totals: TokenTotal[]): Array<Omit<TokenTotal, 'raw'> & { raw: string }> {
  return totals.map((t) => ({ ...t, raw: t.raw.toString() }));
}
