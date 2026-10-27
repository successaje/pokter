import { totalsByToken, type JobAmountInput } from '@/lib/erc8183/job-amount';

/**
 * One line of a workspace total: an amount in one token on one chain, or a
 * count of jobs whose token has not been read yet.
 *
 * The overview and the wallet page used to add every job's budget as an
 * eighteen-decimal number and call the result $U, split only into real and
 * test. With USDT hiring that adds USDT to $U, and a job whose token is not
 * yet known is quietly counted as $U. Each line here is one chain and one
 * token, never a sum across them, and the unknown bucket is counted rather
 * than converted.
 */
export interface TotalLine {
  key: string;
  /** The total itself, so a summary can be built over the lines (`approxUsdTotal`). */
  chainId: number;
  token: string | null;
  raw: bigint;
  decimals: number | null;
  /** "0.3 $U", "2 test USDT", "1 job, currency not yet read". */
  text: string;
  /** Testnet money, which has no value. */
  test: boolean;
}

export function totalLines(jobs: JobAmountInput[]): TotalLine[] {
  const totals = totalsByToken(jobs).filter((t) => t.raw > 0n || t.token === null);
  /* Real money first, then test; within a chain, known tokens before the unknown bucket. */
  const rank = (chainId: number) => (chainId === 56 ? 0 : chainId === 97 ? 1 : 2);
  totals.sort((a, b) => rank(a.chainId) - rank(b.chainId) || a.chainId - b.chainId || Number(a.token === null) - Number(b.token === null));
  return totals.map((t) => {
    const test = t.chainId === 97;
    const key = `${t.chainId}:${t.token ?? 'unknown'}`;
    const money = { chainId: t.chainId, token: t.token, raw: t.raw, decimals: t.decimals };
    if (t.token === null || t.label === null || t.symbol === null) {
      const count = `${t.jobs} job${t.jobs === 1 ? '' : 's'}, currency not yet read`;
      return { key, test, ...money, text: test ? `${count} (testnet)` : t.chainId === 56 ? count : `${count} (chain ${t.chainId})` };
    }
    const amount = t.label.slice(0, t.label.length - t.symbol.length).trim();
    const text = test ? `${amount} test ${t.symbol}` : t.chainId === 56 ? t.label : `${t.label} on chain ${t.chainId}`;
    return { key, test, ...money, text };
  });
}

/** The lines as one string for a compact cell; "0" when there is nothing. */
export function totalText(jobs: JobAmountInput[]): string {
  const lines = totalLines(jobs);
  return lines.length ? lines.map((l) => l.text).join(' · ') : '0';
}
