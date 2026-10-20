import 'server-only';

import { isLifecycleDemo } from '@/lib/agent/credited-history';
import { getBriefStore } from '@/lib/briefs/store';
import { isSelfHire } from '@/lib/erc8183/production-proof';
import { getJobStore } from '@/lib/erc8183/store';
import type { HiredJob } from '@/lib/erc8183/types';
import { getReviewStore } from '@/lib/reviews/store';
import type { VerifiedReview } from '@/lib/reviews/model';
import { teamWalletSet } from '@/lib/team/server';
import { fundedByTeam } from '@/lib/team/wallets';
import { tallyJobs, type NetworkRecord } from './record';

/**
 * The evidence a profile shows, every figure scoped and defined.
 *
 * Two kinds, kept apart on purpose:
 *
 *  - An agent's record belongs to the agent. It is every outside job the
 *    agent has done under whoever owned it at the time, and is labelled
 *    that way. Pokter does not record who owned an agent when each job
 *    happened, so these figures are never added up into the current
 *    owner's own track record: a builder who buys an agent does not
 *    inherit its history as theirs.
 *  - A hirer's record is the jobs this wallet funded as the buyer. The
 *    buyer is named on each job, so that attribution is exact.
 *
 * Job states mean what the escrow records, and no more: a delivery is
 * "submitted" when the provider put one on chain, "settled without
 * dispute" when the review window closed or the buyer approved and the
 * escrow paid out — which is not proof the work was good — and
 * "rejected after dispute" when the policy's voters upheld a dispute.
 */

export type { NetworkRecord };

function tally(jobs: HiredJob[], network: number): NetworkRecord {
  return tallyJobs(jobs, network);
}

/**
 * One agent's outside record, mainnet and testnet apart.
 *
 * Left out: unfunded jobs, jobs Pokter's own wallets funded, lifecycle
 * demonstrations, self-hires (the agent's wallet paying itself), and any
 * job funded by `excludeWallet` — the profile's own wallet, so an owner
 * hiring their own agent never counts as a customer.
 */
export function agentJobs(chainId: number, tokenId: string, excludeWallet: string): HiredJob[] {
  const team = teamWalletSet();
  const self = excludeWallet.toLowerCase();
  return getJobStore()
    .all()
    .filter((j) => (j.agentChainId ?? 56) === chainId && j.agentTokenId === tokenId)
    .filter((j) => j.status !== 'OPEN' && !fundedByTeam(j, team) && !isLifecycleDemo(j) && !isSelfHire(j) && j.client?.toLowerCase() !== self);
}

export function agentRecord(chainId: number, tokenId: string, excludeWallet: string): { mainnet: NetworkRecord; testnet: NetworkRecord } {
  const jobs = agentJobs(chainId, tokenId, excludeWallet);
  return { mainnet: tally(jobs, 56), testnet: tally(jobs, 97) };
}

/** What each job state is called on a profile; payment alone is never called acceptance. */
export const JOB_STATE_LABEL: Record<string, string> = {
  FUNDED: 'Funded, not yet delivered',
  SUBMITTED: 'Delivery submitted, in review',
  COMPLETED: 'Settled without dispute',
  REJECTED: 'Rejected after dispute',
  EXPIRED: 'Expired, escrow reclaimed',
};

/** The jobs this wallet funded as the buyer, counted by state only — never amounts. */
export function hirerRecord(wallet: string): { mainnet: NetworkRecord; testnet: NetworkRecord; requestsPosted: number; requestsOpen: number } {
  const jobs = getJobStore().byClient(wallet).filter((j) => j.status !== 'OPEN');
  const requests = getBriefStore().byPoster(wallet);
  return { mainnet: tally(jobs, 56), testnet: tally(jobs, 97), requestsPosted: requests.length, requestsOpen: requests.filter((r) => r.state === 'open').length };
}

export interface EligibleReviews {
  reviews: Array<VerifiedReview & { agentName: string }>;
  /** Reviews Pokter's moderation removed for breaking its rules; counted so the rest are never presented as complete. */
  hidden: number;
}

/**
 * All eligible reviews for these agents: written by the on-chain buyer of
 * a completed job and signed by them, minus any the profile's own wallet
 * wrote. The owner cannot hide or choose among them; only Pokter's
 * moderation can remove one, and those are counted.
 */
export function eligibleReviews(agents: Array<{ chainId: number; tokenId: string; name: string }>, excludeWallet: string): EligibleReviews {
  const store = getReviewStore();
  const self = excludeWallet.toLowerCase();
  const reviews = agents.flatMap((a) =>
    store
      .byAgent(a.chainId, a.tokenId)
      .filter((r) => r.buyer.toLowerCase() !== self)
      .map((r) => ({ ...r, agentName: a.name })),
  );
  const hidden = agents.reduce((n, a) => n + store.hiddenCount(a.chainId, a.tokenId), 0);
  return { reviews: reviews.sort((x, y) => Date.parse(y.updatedAt) - Date.parse(x.updatedAt)), hidden };
}
