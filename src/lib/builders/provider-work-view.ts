import 'server-only';

import { deliverableKey, readDeliverable } from '@/lib/erc8183/deliverables';
import { getJobStore } from '@/lib/erc8183/store';
import type { HiredJob } from '@/lib/erc8183/types';
import { getBriefStore } from '@/lib/briefs/store';
import { earningsByChain } from './provider-earnings';
import {
  recordDeliverySubmission,
  placeStagedProposal,
  stagedDeliveriesByOwner,
  stagedProposalsByOwner,
} from '@/lib/assistant/provider-db';
import type { StagedDelivery, StagedProposal } from '@/lib/assistant/provider-store';

import { providerFleet, type ProviderAgent } from './provider-identity';

/**
 * What an assistant has left waiting on its owner, read from the records
 * that decide it rather than from the rows the assistant wrote.
 *
 * A staged proposal becomes real when the owner's signature puts a bid on
 * the request; a staged deliverable becomes real when the provider wallet's
 * transaction is confirmed against the chain. Both of those happen
 * somewhere this process may never see — another device, a closed tab, a
 * wallet prompt answered after the page was gone. So the staged rows are
 * reconciled against the two authoritative records before anything is
 * reported:
 *
 *  - the bids table, which only accepts a signature the registry owner
 *    produced, and
 *  - the stored deliverable's `submitTxHash`, which `/api/builders/
 *    deliveries` writes only after reading the receipt back from chain and
 *    checking it encodes this exact submission.
 *
 * Without this, an assistant that restarted would be told its proposal was
 * still unsigned and ask for a second signature, and — the expensive one —
 * would be told a delivered job still needed delivering.
 */

export interface ProviderWaiting {
  proposals: Array<StagedProposal & { requestTitle: string | null; requestOpen: boolean }>;
  deliveries: Array<StagedDelivery & { job: HiredJob | null }>;
}

/**
 * Attach what has happened since, and return the staged work as it now
 * stands. Called by every surface that reports it, so the page and the
 * tools can never disagree about whether something is still waiting.
 */
export function reconcileStagedWork(owner: string): ProviderWaiting {
  const briefs = getBriefStore();
  const proposals = stagedProposalsByOwner(owner).map((staged) => {
    let current = staged;
    if (!current.bidId) {
      /* The bids table is the authority on whether a proposal is placed: a
         row only gets there through a signature the registry owner made. */
      const bid = briefs.bidFor(current.requestId, current.agentChainId, current.agentTokenId);
      if (bid && bid.bidder.toLowerCase() === owner.toLowerCase()) {
        placeStagedProposal(current.key, bid.id);
        current = { ...current, state: 'placed', bidId: bid.id };
      }
    }
    const request = briefs.get(current.requestId);
    return {
      ...current,
      requestTitle: request?.title ?? null,
      requestOpen: request?.state === 'open',
    };
  });

  const jobs = getJobStore();
  const deliveries = stagedDeliveriesByOwner(owner).map((staged) => {
    let current = staged;
    if (!current.submitTxHash) {
      /* Written only after the delivery route read the receipt back from
         chain and confirmed it encodes this submission, so it is proof and
         not a claim. */
      const stored = readDeliverable(deliverableKey(current.chainId, current.jobId));
      if (stored?.submitTxHash) {
        recordDeliverySubmission(current.key, stored.submitTxHash);
        current = { ...current, state: 'submitted', submitTxHash: stored.submitTxHash };
      }
    }
    return { ...current, job: jobs.byId(`${current.chainId}:${current.jobId}`) };
  });

  return { proposals, deliveries };
}

/** Every job in Pokter's index that belongs to one of these agents, newest first. */
export function jobsForAgents(agents: readonly ProviderAgent[]): HiredJob[] {
  const keys = new Set(agents.map((a) => `${a.chainId}:${a.tokenId}`));
  return getJobStore()
    .all()
    .filter((job) => keys.has(`${job.agentChainId ?? 56}:${job.agentTokenId}`))
    .sort((a, b) => Date.parse(b.hiredAt) - Date.parse(a.hiredAt));
}

/** The provider's own fleet and every job indexed for it, in one call. */
export async function providerWorkload(owner: string) {
  const fleet = await providerFleet(owner);
  return { fleet, jobs: jobsForAgents(fleet.agents) };
}

/* Re-exported so a page or a tool reads earnings from the same place it
   reads the jobs, while the arithmetic stays in a module a test can run. */
export { earningsByChain };
