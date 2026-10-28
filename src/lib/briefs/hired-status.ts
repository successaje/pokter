import 'server-only';

import { hireForChosenProposal } from '@/lib/briefs/hired';
import type { Bid, Brief } from '@/lib/briefs/model';
import { getJobStore } from '@/lib/erc8183/store';

/**
 * Whether a request's chosen proposal became a funded job, read the way
 * its page reads it, so the API never calls a request "Agent chosen"
 * that the page calls "Agent hired".
 */
export function requestHired(brief: Brief, bids: readonly Bid[]): boolean {
  const chosen = brief.awardedBidId ? bids.find((bid) => bid.id === brief.awardedBidId) : undefined;
  if (!chosen) return false;
  const hire = hireForChosenProposal(getJobStore().byClient(brief.poster), brief, chosen);
  return Boolean(hire && !hire.returned);
}
