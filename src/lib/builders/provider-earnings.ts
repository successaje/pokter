import { formatUnits } from 'viem';

import { jobToken } from '@/lib/erc8183/job-amount';
import { paymentTokenAt } from '@/lib/network/tokens';
import type { JobStatusName } from '@/lib/erc8183/types';

/**
 * What a provider's jobs came to, counted so that no line is a false claim.
 *
 * Its own pure module rather than a function in `provider-work-view.ts`,
 * because that file is `server-only` and this is the arithmetic behind a
 * figure on a page. Four defects shipped on this repository where the code
 * was right and the page's claim was wrong — one of them a card that
 * printed `0` as a claim — and every one needed a rendered page to find. An
 * earnings figure is the same shape of risk, so it is a pure function with
 * a test.
 *
 * Two rules, both of which an obvious implementation gets wrong:
 *
 *  - **Only `COMPLETED` is earned.** A `FUNDED` job is money a buyer has
 *    committed and nobody has been paid. A `SUBMITTED` job is delivered and
 *    sitting in its review window, and may still be disputed and refunded.
 *    Summing any of those into "earned" tells a provider they have money
 *    they do not have.
 *  - **The chains are never added together.** Chain 56 settles in real $U
 *    and chain 97 in a test token with no value. One combined figure would
 *    not be a number about money, so the shape of the answer is a line per
 *    chain and there is no total.
 */

export interface EarningsJob {
  chainId: number;
  status: JobStatusName;
  /** Raw units of the job's token, as the escrow holds it. */
  budgetRaw: string;
  /** The job's token; null or absent is unknown (see `job-amount`). */
  paymentToken?: string | null;
}

export interface EarningsLine {
  chainId: number;
  /**
   * The money this line is in. One line per chain *and* token: a USDT line
   * is never added to a $U line. The `…U` amounts are whole units of this
   * token (the names predate other tokens); with `token` null they are raw
   * base units, because an unknown token has no known scale.
   */
  token: string | null;
  symbol: string | null;
  /** Whether this chain's token is real money. Carried per line so the two are never summed. */
  realMoney: boolean;
  releasedU: string;
  releasedJobs: number;
  inEscrowU: string;
  inEscrowJobs: number;
  awaitingReviewU: string;
  awaitingReviewJobs: number;
  refundedU: string;
  refundedJobs: number;
  rejectedU: string;
  rejectedJobs: number;
  /**
   * Refunded and rejected together: escrow that ended without paying.
   *
   * Summed here, as raw units, rather than by the page adding the two
   * formatted strings back together — which is what it did, and
   * `Number('0.1') + Number('0.2')` is how a money figure acquires a tail
   * of nines. A total a page needs is computed where the arithmetic is
   * exact and tested, not in the markup.
   */
  didNotPayU: string;
  didNotPayJobs: number;
}

export function earningsByChain(jobs: readonly EarningsJob[]): EarningsLine[] {
  const byChain = new Map<string, EarningsJob[]>();
  for (const job of jobs) {
    const key = `${job.chainId}|${(jobToken(job) ?? '').toLowerCase()}`;
    const list = byChain.get(key);
    if (list) list.push(job);
    else byChain.set(key, [job]);
  }
  const sum = (list: readonly EarningsJob[]) => list.reduce((total, job) => total + BigInt(job.budgetRaw), 0n);
  const of = (list: readonly EarningsJob[], status: JobStatusName) => list.filter((job) => job.status === status);
  return [...byChain.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([key, list]) => {
      const chainId = Number(key.split('|')[0]);
      const tokenAddress = key.split('|')[1] || null;
      const known = tokenAddress ? paymentTokenAt(chainId, tokenAddress) : null;
      /* Summed as BigInt and formatted once, at the token's own scale; raw when the scale is unknown. */
      const U = (raw: bigint) => (known ? formatUnits(raw, known.decimals) : raw.toString());
      const released = of(list, 'COMPLETED');
      const funded = of(list, 'FUNDED');
      const submitted = of(list, 'SUBMITTED');
      const refunded = of(list, 'EXPIRED');
      const rejected = of(list, 'REJECTED');
      return {
        chainId,
        token: known?.address ?? tokenAddress,
        symbol: known ? (known.symbol === 'U' ? '$U' : known.symbol) : null,
        realMoney: chainId === 56,
        releasedU: U(sum(released)),
        releasedJobs: released.length,
        inEscrowU: U(sum(funded)),
        inEscrowJobs: funded.length,
        awaitingReviewU: U(sum(submitted)),
        awaitingReviewJobs: submitted.length,
        refundedU: U(sum(refunded)),
        refundedJobs: refunded.length,
        rejectedU: U(sum(rejected)),
        rejectedJobs: rejected.length,
        didNotPayU: U(sum(refunded) + sum(rejected)),
        didNotPayJobs: refunded.length + rejected.length,
      };
    });
}
