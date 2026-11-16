import 'server-only';

import { getJobStore } from '@/lib/erc8183/store';
import { jobAmountLabel, jobToken } from '@/lib/erc8183/job-amount';
import { jobEvidencePath, jobFunder } from '@/lib/jobs/evidence-view';
import { chainLabel, explorerBaseFor } from '@/lib/network/presentation';
import { teamWalletSet } from '@/lib/team/server';

/**
 * The whole escrow record, as a row of things anyone can open.
 *
 * A marketplace scrolling its recent activity is a brag, and the device only
 * works for one busy enough to brag. Pokter is not: of the fourteen most
 * recent jobs that can be opened, thirteen were funded by Pokter's own
 * wallets and three ended without a delivery. A row built to look busy would
 * have to drop those, and dropping them is the one thing this site does not
 * do.
 *
 * So it is not recent activity, it is the record — every job that can be
 * opened, the misses in the row beside the settlements, the team-funded ones
 * saying so on their face. That inverts what the device is for: not "look how
 * busy we are", which is not true, but "here is all of it, including what did
 * not work", which is, and which nobody else running one of these is willing
 * to show.
 *
 * Each card carries the two links that settle it — the job's own evidence
 * page, and the transaction on a block explorer Pokter does not run. The
 * point is not that the row moves. It is that a sceptic can stop it, click
 * anything in it, and land somewhere Pokter does not control.
 *
 * A job with no transaction recorded is the only kind left out, because a
 * card that opens nothing is the one thing this must never contain.
 */

export interface TickerEvent {
  key: string;
  /**
   * What became of it, in one word a reader scans for. `Expired`, `Reclaimed`
   * and `Rejected` are in this list on purpose, and are not drawn as failures
   * of the marketplace: a job that expired returned the buyer's money, which
   * is the escrow doing exactly what it promises.
   */
  verb: 'Settled' | 'Delivered' | 'Funded' | 'Reclaimed' | 'Expired' | 'Rejected';
  agent: string;
  /**
   * Null when the job's currency has never been read. `jobAmountLabel` says
   * so at length, which is right on a job page and wrong here: a strip is
   * scanned, and a card that spends its width explaining what it does not
   * know crowds out the ones that know. The card drops the amount instead,
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

export interface JobRecord {
  events: TickerEvent[];
  /** Every job Pokter has indexed, openable or not: what the row is part of. */
  indexed: number;
  /** How many in the row ended without a delivery. Counted above it, not buried in it. */
  missed: number;
}

/** Jobs that ended without the agent delivering. The money went back. */
const MISSES = new Set(['Expired', 'Reclaimed', 'Rejected']);

/**
 * Every job that can be opened, newest first.
 *
 * `cap` is for the browser, not for the argument: each card is a flex item
 * carrying two links and the row is drawn twice to loop, so the whole record
 * at a few hundred jobs is thousands of nodes nobody will read. `indexed`
 * above the row is the real total, and the proof page carries all of it.
 */
export function wholeRecord(cap = 60): JobRecord {
  const team = teamWalletSet();
  const all = getJobStore().all();

  const events = all
    /*
     * A card has to be openable or it has no business being here: the whole
     * argument of the row is that any of it can be checked, and one card that
     * leads nowhere makes a reader doubt the rest.
     */
    .filter((job) => Boolean(job.hireTxHash || job.settleTxHash || job.reclaimTxHash))
    .sort((a, b) => Date.parse(b.hiredAt) - Date.parse(a.hiredAt))
    .slice(0, cap)
    .map((job): TickerEvent => {
      const settled = job.status === 'COMPLETED';
      const explorer = explorerBaseFor(job.chainId);
      /*
       * The transaction that ended it where there is one, so a card opens on
       * what the reader is being told happened rather than on the funding.
       */
      const tx = settled
        ? (job.settleTxHash ?? job.hireTxHash)
        : (job.reclaimTxHash ?? job.hireTxHash);
      return {
        key: `${job.chainId}:${job.jobId}`,
        verb:
          settled ? 'Settled'
          : job.status === 'SUBMITTED' ? 'Delivered'
          : job.status === 'REJECTED' ? 'Rejected'
          : job.status === 'EXPIRED' ? (job.reclaimTxHash ? 'Reclaimed' : 'Expired')
          : 'Funded',
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

  return {
    events,
    indexed: all.length,
    missed: events.filter((event) => MISSES.has(event.verb)).length,
  };
}
