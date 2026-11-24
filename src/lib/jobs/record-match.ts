import { getAddress, isAddress, type Address } from 'viem';

import type { HiredJob } from '@/lib/erc8183/types';

/**
 * Whether the escrow's job with a saved hire's number is that hire.
 *
 * A hire saved in a browser carries the number the browser read when it
 * was funded. Read before the chain had settled, that number could be
 * somebody else's job, and every later refresh then copied that job's
 * status onto this hire: a 0.05 hire showed as "Settled" because another
 * buyer's 1 $U job with its number had been, and its currency could never
 * be read, because the job is not Pokter's to look up.
 *
 * So the number is checked against what the hire itself knows: the agent
 * wallet it pays, and the wallet that funded it when that was read from
 * chain. The funding wallet is not compared with the wallet the hire is
 * saved under: a free trial is funded by Pokter's own wallet, not the
 * buyer's.
 */

const ZERO = '0x0000000000000000000000000000000000000000';

export type NumberMismatch = NonNullable<HiredJob['numberMismatch']>;

const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && isAddress(a) && isAddress(b) && getAddress(a) === getAddress(b));

/**
 * An empty answer: the number is unused, or the node answering has not seen
 * the job yet, as right after it was funded. Not evidence either way, so
 * nothing is flagged and nothing is copied from it.
 */
export function unreadJob(onchain: { client: string }): boolean {
  return !onchain.client || onchain.client.toLowerCase() === ZERO;
}

/** The mismatch when the escrow's job with this number exists and is another job; null when it is this hire or nothing was read. */
export function savedJobMismatch(onchain: { client: string; provider: string }, saved: Pick<HiredJob, 'provider' | 'client'>, checkedAt: string): NumberMismatch | null {
  if (unreadJob(onchain)) return null;
  const providerDiffers = Boolean(saved.provider) && !same(onchain.provider, saved.provider);
  const clientDiffers = Boolean(saved.client) && !same(onchain.client, saved.client);
  if (!providerDiffers && !clientDiffers) return null;
  return { checkedAt, provider: getAddress(onchain.provider) as Address, client: getAddress(onchain.client) as Address };
}

/**
 * A saved hire after its number was checked: flagged when the number is
 * another job's, cleared when it checks out, with the currency filled in
 * once the escrow names it. Null when nothing changed.
 */
export function checkedSavedJob(
  saved: HiredJob,
  onchain: { client: string; provider: string },
  paymentToken: Address | null,
  checkedAt: string,
): HiredJob | null {
  if (unreadJob(onchain)) return null;
  const mismatch = savedJobMismatch(onchain, saved, checkedAt);
  if (mismatch) return saved.numberMismatch ? null : { ...saved, numberMismatch: mismatch };
  const token = saved.paymentToken ?? paymentToken ?? null;
  if (!saved.numberMismatch && token === (saved.paymentToken ?? null)) return null;
  return { ...saved, numberMismatch: null, paymentToken: token };
}
