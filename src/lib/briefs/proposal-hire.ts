import 'server-only';

import type { Address } from 'viem';

import { defaultHireToken, requestToken } from '@/lib/network/tokens';

import { hireTaskFromRequest, type ProposalForHire } from './model';
import { getBriefStore } from './store';

/**
 * The proposal a hire names, if it really is the one chosen on its request
 * and is for this agent: the request's terms carried into the hire, so it
 * is the hire the poster chose. Anything else is null.
 *
 * One reading for both hires from a chosen proposal: the hire page, opened
 * from the request (`?proposal=`), and `prepare_hire` with `proposal_id`,
 * used by an assistant driving a wallet that has no hire page.
 */
export function chosenProposalForHire(id: string | undefined | null, chainId: number, tokenId: string): { proposal: ProposalForHire; task: string; poster: Address; proposalId: string } | null {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const store = getBriefStore();
  const bid = store.bid(id);
  if (!bid || bid.agentChainId !== chainId || bid.agentTokenId !== tokenId) return null;
  const request = store.get(bid.briefId);
  if (!request || request.awardedBidId !== bid.id) return null;
  /*
   * The proposal's money, resolved once here: its own token, else its
   * request's, else (rows from before either carried one) the chain's $U.
   * A token Pokter cannot name drops the proposal rather than letting the
   * hire assume one.
   */
  const token = requestToken(request.chainId, bid.paymentToken ?? request.paymentToken);
  if (!token) return null;
  return {
    proposal: {
      requestId: request.id,
      requestTitle: request.title,
      priceU: bid.priceU,
      priceRaw: bid.priceRaw,
      paymentToken: token.address,
      deliverDays: bid.deliverDays,
      chainId: request.chainId,
    },
    task: hireTaskFromRequest(request),
    poster: request.poster,
    proposalId: bid.id,
  };
}

/**
 * Why the owner's terms disagree with the chosen proposal they named, or
 * null when they agree: a hire from a proposal is that proposal, so its
 * request's task and network and its token are fixed, and the ceiling may
 * be no higher than its price. `get_request` gives the exact values.
 */
export function proposalHireProblem(
  chosen: { proposal: { chainId: number; priceU: number; paymentToken: string }; task: string },
  owner: { task: string; escrowChain: number; maxBudget: number; ownerToken: string | null },
): string | null {
  const { proposal, task } = chosen;
  if (owner.escrowChain !== proposal.chainId) return `The proposal was chosen to be funded on chain ${proposal.chainId}: send escrow_chain_id ${proposal.chainId}. Nothing was prepared.`;
  if (!(owner.maxBudget <= proposal.priceU)) return `The proposal's price is ${proposal.priceU}, and a hire from it is funded at no more than that: max_budget may not be above it. Nothing was prepared.`;
  const token = (owner.ownerToken ?? defaultHireToken(owner.escrowChain)?.address ?? '').toLowerCase();
  if (token !== proposal.paymentToken.toLowerCase()) return `The proposal is in ${proposal.paymentToken}: send it as payment_token. Nothing was prepared.`;
  if (owner.task !== task) return 'A hire from a proposal carries out the request it answers, so its task is the request’s, exactly as get_request gives it for the chosen proposal. Nothing was prepared.';
  return null;
}
