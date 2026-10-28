import 'server-only';

import { isLifecycleDemo } from '@/lib/agent/credited-history';
import { getJobStore } from '@/lib/erc8183/store';
import { isSelfHire } from '@/lib/erc8183/production-proof';
import { summarizeMarketplaceActivity } from '@/lib/erc8183/activity-stats';
import { teamWalletSet } from '@/lib/team/server';
import { fundedByTeam } from '@/lib/team/wallets';

export interface OutsideActivity {
  /** Jobs an outside buyer funded through escrow, on either chain. */
  funded: number;
  /** Funded or submitted: the escrow is still holding the money. */
  open: number;
  /** Settled with the agent's answer and paid to the agent: demonstrations, self-hires and courier jobs removed. */
  answered: number;
  /** Settled with the agent's answer, carried by Pokter's courier, which the escrow paid instead of the agent. */
  viaCourier: number;
}

/**
 * What outside buyers have actually done through Pokter's escrow.
 *
 * Extracted so that two pages cannot quietly disagree about it. The home
 * page's record and the catalogue now read the same three numbers from the
 * same place, which matters because they are the figures a reader is most
 * likely to check one against the other.
 *
 * Four exclusions, all of them deliberate. Jobs Pokter's own wallets
 * funded are not outside demand. Lifecycle demonstrations settle like any
 * job and prove the rail works, not that anybody wanted the work. A
 * self-hire is an operator paying their own agent. A courier job carried
 * the agent's answer but paid Pokter's wallet, not the agent's. An outside review once
 * read the unfiltered figure as useful customer outcomes when the strict
 * count was about half of it, which is why `answered` is the strict one.
 */
export function outsideActivity(): OutsideActivity {
  const team = teamWalletSet();
  const buyerJobs = getJobStore().all().filter((job) => !fundedByTeam(job, team));
  const totals = summarizeMarketplaceActivity(buyerJobs);
  const completed = buyerJobs.filter((job) => job.status === 'COMPLETED');
  const answeredAtAll = completed.filter((job) => !isLifecycleDemo(job) && !isSelfHire(job));
  /* Paid to a Pokter wallet: the courier's job, not the agent's paid work. The same rule as the proof page. */
  const paidToPokter = (job: (typeof completed)[number]) => typeof job.provider === 'string' && team.has(job.provider.toLowerCase());
  const viaCourier = answeredAtAll.filter(paidToPokter).length;
  return { funded: totals.indexedJobs, open: totals.activeJobs, answered: answeredAtAll.length - viaCourier, viaCourier };
}
