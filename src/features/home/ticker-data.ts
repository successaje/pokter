import 'server-only';

import { getJobStore } from '@/lib/erc8183/store';
import { jobAmountLabel, jobToken } from '@/lib/erc8183/job-amount';
import { jobEvidencePath, jobFunder } from '@/lib/jobs/evidence-view';
import { chainLabel, explorerBaseFor } from '@/lib/network/presentation';
import { teamWalletSet } from '@/lib/team/server';

/**
 * What has actually happened here lately, as a row of things anyone can open.
 *
 * Every marketplace can run a feed of its own activity, and a reader is right
 * to ignore one: the events are the house's word for the house's record, and
 * nothing in them can be checked from outside. This feed is the same device
 * with the opposite property. Each card is one escrow job, and each carries
 * the two links that settle it — the job's own evidence page, and the
 * transaction on a block explorer Pokter does not run.
 *
 * So the point of it is not that it moves. It is that a sceptic can stop it,
 * click any card, and land on a chain they already trust.
 *
 * The rules the rest of the site keeps apply here and cost it most of its
 * rows. A job funded by one of Pokter's own wallets says so on the card
 * rather than passing as a customer. A job whose escrow has no transaction
 * recorded is left out entirely, because a card nobody can open is the one
 * thing this is supposed to never be.
 */

export interface TickerEvent {
  key: string;
  /** What happened, in two words: the verb a reader scans for. */
  verb: 'Settled' | 'Delivered' | 'Funded';
  agent: string;
  /**
   * Null when the job's currency has never been read. `jobAmountLabel` says
   * so at length, which is right on a job page and wrong here: a strip is
   * scanned, and a card that spends its width explaining what it does not
   * know crowds out the fourteen that do. The card drops the amount instead,
   * and never guesses a token.
   */
  amount: string | null;
  network: string;
  at: string;
  /** Pokter's own page for the job: the evidence, the checks, the brief. */
  href: string;
  /** The transaction, on a chain explorer Pokter does not operate. */
  txHref: string | null;
  /** True when a Pokter wallet funded it. Said on the card, never implied away. */
  team: boolean;
}

/**
 * The most recent jobs that can be opened, newest first.
 *
 * `limit` is what the row draws; it duplicates the set to scroll seamlessly,
 * so this is the number of distinct events, not the number of cards.
 */
export function recentEvents(limit = 14): TickerEvent[] {
  const team = teamWalletSet();
  const rows = getJobStore()
    .all()
    /*
     * A card has to be openable or it has no business being here: the whole
     * argument of the row is that any of it can be checked, and one card that
     * leads nowhere makes a reader doubt the rest.
     */
    .filter((job) => Boolean(job.hireTxHash || job.settleTxHash))
    .sort((a, b) => Date.parse(b.hiredAt) - Date.parse(a.hiredAt))
    .slice(0, limit);

  return rows.map((job) => {
    const settled = job.status === 'COMPLETED';
    const submitted = job.status === 'SUBMITTED';
    const explorer = explorerBaseFor(job.chainId);
    const tx = settled ? (job.settleTxHash ?? job.hireTxHash) : job.hireTxHash;
    return {
      key: `${job.chainId}:${job.jobId}`,
      verb: settled ? 'Settled' : submitted ? 'Delivered' : 'Funded',
      agent: job.agentName,
      amount: jobToken({ chainId: job.chainId, paymentToken: job.paymentToken ?? null })
        ? jobAmountLabel({ chainId: job.chainId, paymentToken: job.paymentToken ?? null, budgetRaw: job.budgetRaw })
        : null,
      network: chainLabel(job.chainId),
      at: job.hiredAt,
      href: jobEvidencePath(job),
      txHref: tx ? `${explorer}/tx/${tx}` : null,
      team: jobFunder({ client: job.client ?? null, provider: job.provider }, team) !== 'outside',
    };
  });
}
