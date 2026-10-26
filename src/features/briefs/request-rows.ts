import 'server-only';

import { acceptsProposals } from '@/lib/briefs/model';
import { hireForChosenProposal } from '@/lib/briefs/hired';
import { getBriefStore } from '@/lib/briefs/store';
import { getJobStore } from '@/lib/erc8183/store';
import { publicIdentities } from '@/lib/profiles/identity';
import type { RequestRowData } from './RequestRow';

/**
 * Every request as the board and Discover list it, with its proposal
 * count, whether it still takes proposals, and its poster's published
 * name and picture (a private profile keeps the generated picture), and
 * whether its chosen proposal has been hired.
 * One builder, so a request reads the same wherever it appears.
 */
export function requestRows(now: number): Array<RequestRowData & { taking: boolean }> {
  const store = getBriefStore();
  const all = store.all();
  const identities = publicIdentities(all.map((b) => b.poster));
  const jobs = getJobStore();
  const hired = (b: (typeof all)[number]) => {
    if (b.state !== 'awarded' || !b.awardedBidId) return false;
    const bid = store.bidsFor(b.id).find((x) => x.id === b.awardedBidId);
    if (!bid) return false;
    const hire = hireForChosenProposal(jobs.byClient(b.poster), b, bid);
    return Boolean(hire && !hire.returned);
  };
  return all.map((b) => ({
    id: b.id,
    poster: b.poster,
    posterIdentity: identities.get(b.poster.toLowerCase()) ?? null,
    title: b.title,
    brief: b.brief,
    budgetU: b.budgetU,
    budgetRaw: b.budgetRaw,
    paymentToken: b.paymentToken,
    chainId: b.chainId,
    closesAt: b.closesAt ?? null,
    category: b.category ?? null,
    postedAt: b.postedAt,
    state: b.state,
    proposals: store.bidsFor(b.id).length,
    taking: acceptsProposals(b, now),
    hired: hired(b),
  }));
}
