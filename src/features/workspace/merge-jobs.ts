import type { HiredJob } from '@/lib/erc8183/types';

/**
 * A wallet's jobs: the ones this browser remembers, plus the ones Pokter has
 * indexed for the wallet, newest first.
 *
 * A job in both keeps this browser's record, which can be ahead of the index
 * (a transaction it sent a moment ago). Its token is the exception and
 * comes from the index when the index has one. The index reads it from the
 * escrow's `jobPaymentToken`, while a browser record saved before the token
 * was recorded has none. Keeping the browser's copy whole showed every
 * earlier job as "base units (currency not yet read)" even after the
 * currency backfill had read all of them.
 */
export function mergeWalletJobs(stored: readonly HiredJob[], indexed: readonly HiredJob[]): HiredJob[] {
  const key = (j: HiredJob) => `${j.chainId}:${j.jobId}`;
  const tokenOf = new Map(indexed.filter((j) => j.paymentToken).map((j) => [key(j), j.paymentToken]));
  const local = new Set(stored.map(key));
  const merged = [
    ...stored.map((j) => {
      const token = tokenOf.get(key(j));
      return token && token !== j.paymentToken ? { ...j, paymentToken: token } : j;
    }),
    ...indexed.filter((j) => !local.has(key(j))),
  ];
  merged.sort((a, b) => Date.parse(b.hiredAt) - Date.parse(a.hiredAt));
  // Jobs remembered before agentChainId existed are mainnet identities.
  return merged.map((j) => (j.agentChainId ? j : { ...j, agentChainId: 56 }));
}
