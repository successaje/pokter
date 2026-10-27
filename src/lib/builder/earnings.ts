import { isDollarUJob, totalsByToken, type TokenTotal } from '@/lib/erc8183/job-amount';

/**
 * What a builder was paid, kept apart by escrow network.
 *
 * Studio added every completed job's budget into one "Earned" figure, so
 * test-token payments on BNB Testnet were shown as money released on BNB
 * Chain. Real earnings come only from chain 56; anything else is practice
 * and is reported separately, never summed in.
 */
export function earnedByNetwork(jobs: ReadonlyArray<{ chainId: number; status: string; budgetRaw: string; paymentToken?: string | null }>): { real: bigint; test: bigint } {
  let real = 0n;
  let test = 0n;
  for (const job of jobs) {
    if (job.status !== 'COMPLETED') continue;
    /* Both figures are $U. A job in other money is not added to them. */
    if (!isDollarUJob(job)) continue;
    const amount = BigInt(job.budgetRaw);
    if (job.chainId === 56) real += amount;
    else test += amount;
  }
  return { real, test };
}

export interface EarnedLine extends TokenTotal {
  /** Chain 56: real money. Anything else is test money with no value, and is said to be. */
  realMoney: boolean;
}

/**
 * What a builder was paid, one line per chain *and* token.
 *
 * `earnedByNetwork` is $U only, which was every job until USDT hiring. A
 * USDT job is real money too and has to be shown, but never added to $U:
 * the two are different tokens, and a sum of them is a number about
 * nothing. Jobs whose token has not been read get their own line, counted
 * and not converted. Real money comes first, then test.
 */
export function earnedByToken(jobs: ReadonlyArray<{ chainId: number; status: string; budgetRaw: string; paymentToken?: string | null }>): EarnedLine[] {
  const rank = (chainId: number) => (chainId === 56 ? 0 : chainId === 97 ? 1 : 2);
  return totalsByToken(jobs.filter((job) => job.status === 'COMPLETED'))
    .map((total) => ({ ...total, realMoney: total.chainId === 56 }))
    .sort((a, b) => rank(a.chainId) - rank(b.chainId) || a.chainId - b.chainId || Number(a.token === null) - Number(b.token === null) || (a.symbol ?? '').localeCompare(b.symbol ?? ''));
}

/** An earned line in words: "1.5 $U", "2 test USDT (no value)", "3 jobs, currency not yet read". */
/** Earned lines as money lines, for one summary figure over them (`approxUsdTotal`). */
export function earnedMoneyLines(lines: readonly EarnedLine[]) {
  return lines
    .filter((line) => line.raw > 0n || line.token === null)
    .map((line) => ({ key: `${line.chainId}:${line.token ?? 'unknown'}`, text: earnedLineText(line), chainId: line.chainId, token: line.token, raw: line.raw, decimals: line.decimals }));
}

export function earnedLineText(line: EarnedLine): string {
  if (line.token === null || line.label === null || line.symbol === null) {
    return `${line.jobs} job${line.jobs === 1 ? '' : 's'}, currency not yet read${line.realMoney ? '' : ' (test)'}`;
  }
  if (line.realMoney) return line.label;
  const amount = line.label.slice(0, line.label.length - line.symbol.length).trim();
  return `${amount} test ${line.symbol}`;
}
