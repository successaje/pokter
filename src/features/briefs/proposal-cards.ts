import 'server-only';

import type { Bid } from '@/lib/briefs/model';
import { getBriefStore } from '@/lib/briefs/store';
import { findRows, type FindRow } from '@/lib/find/rows';
import { listSearchable } from '@/lib/marketplace';
import { resolveAgentImage } from '@/lib/registry/image';
import { getAgent } from '@/lib/scan/client';
import { publicIdentity, type PublicIdentity } from '@/lib/profiles/identity';

export interface ProposalCard {
  bid: Bid;
  name: string;
  imageUrl: string | null;
  /** The agent's record in Pokter's catalogue; null when it is not listed, which is said, not hidden. */
  row: FindRow | null;
  /** The proposer's published name, when their profile is published. */
  bidder: PublicIdentity | null;
  /** Whether its price is the one the agent signed for this request (`proposal-price.ts`), rather than one typed before that was required. */
  signedPrice: boolean;
}

/**
 * Each proposal with the agent behind it, as the catalogue knows it.
 *
 * A proposal is a price and a promise; what lets a buyer weigh one against
 * another is the agent's record — does it answer, has it been paid and
 * delivered, what does it usually charge. That record is the same row
 * Discover draws its cards from, read from the same cached catalogue, so
 * a proposal never claims more about an agent than its card does.
 *
 * An agent Pokter has not listed still gets its name and picture from the
 * registry, and is shown as having no record here rather than dropped.
 */
export async function proposalCards(bids: Bid[]): Promise<ProposalCard[]> {
  if (bids.length === 0) return [];
  const entries = await listSearchable({ limit: 400 }).catch(() => []);
  const wanted = new Set(bids.map((b) => `${b.agentChainId}:${b.agentTokenId}`));
  const rows = new Map(
    findRows(entries.filter((e) => wanted.has(`${e.listing.agent.chain_id}:${e.listing.agent.token_id}`))).map((row) => [`${row.chainId}:${row.tokenId}`, row]),
  );

  const store = getBriefStore();
  return Promise.all(
    bids.map(async (bid) => {
      const row = rows.get(`${bid.agentChainId}:${bid.agentTokenId}`) ?? null;
      const bidder = publicIdentity(bid.bidder);
      const signedPrice = store.proposalQuote(bid.briefId, bid.agentChainId, bid.agentTokenId)?.priceRaw === bid.priceRaw;
      if (row) return { bid, name: row.name, imageUrl: row.imageUrl, row, bidder, signedPrice };
      const chainId = bid.agentChainId as 56 | 97;
      const detail = await getAgent(chainId, bid.agentTokenId).catch(() => null);
      const imageUrl = await resolveAgentImage(chainId, bid.agentTokenId, detail?.image_url).catch(() => null);
      return { bid, name: detail?.name ?? `Agent #${bid.agentTokenId}`, imageUrl, row: null, bidder, signedPrice };
    }),
  );
}
