import 'server-only';

import { isLifecycleDemo } from '@/lib/agent/credited-history';
import { getJobStore } from '@/lib/erc8183/store';
import { courierPaidTest } from '@/lib/erc8183/courier-paid';
import { fundingEvidence } from '@/lib/erc8183/funding-evidence';
import { isSelfHire } from '@/lib/erc8183/production-proof';
import { summarizeMarketplaceActivity } from '@/lib/erc8183/activity-stats';
import { registeredWalletRead } from '@/lib/registry/live-agent';
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
  /** Of `answered`, how many were on BNB Chain: most outside work so far is testnet, and a total that hid that would flatter it. */
  answeredMainnet: number;
  /** Distinct wallets outside the team that funded a job, operators funding their own agent left out; and how many funded one on BNB Chain. */
  buyers: { wallets: number; mainnet: number };
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
export async function outsideActivity(): Promise<OutsideActivity> {
  const team = teamWalletSet();
  const buyerJobs = getJobStore().all().filter((job) => !fundedByTeam(job, team));
  const totals = summarizeMarketplaceActivity(buyerJobs);
  const completed = buyerJobs.filter((job) => job.status === 'COMPLETED');
  const answeredAtAll = completed.filter((job) => !isLifecycleDemo(job) && !isSelfHire(job));
  /* Paid to Pokter's courier: the courier's job, not the agent's paid work. The same rule as the proof page. */
  const paidToCourier = await courierPaidTest(answeredAtAll, team, registeredWalletRead);
  const viaCourier = answeredAtAll.filter(paidToCourier).length;
  const answeredMainnet = answeredAtAll.filter((job) => job.chainId === 56 && !paidToCourier(job)).length;
  /* By wallet, so one busy buyer is one buyer; a funding the escrow does not prove is not a purchase. */
  const wallets = new Map<string, boolean>();
  for (const job of buyerJobs) {
    if (!job.client || isSelfHire(job) || isLifecycleDemo(job) || fundingEvidence(job) !== 'funded') continue;
    const wallet = job.client.toLowerCase();
    wallets.set(wallet, (wallets.get(wallet) ?? false) || job.chainId === 56);
  }
  return {
    funded: totals.indexedJobs,
    open: totals.activeJobs,
    answered: answeredAtAll.length - viaCourier,
    viaCourier,
    answeredMainnet,
    buyers: { wallets: wallets.size, mainnet: [...wallets.values()].filter(Boolean).length },
  };
}
