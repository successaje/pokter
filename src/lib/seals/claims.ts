import 'server-only';

import { listSearchable } from '@/lib/marketplace';
import { verdictFor } from '@/lib/search/match';
import { isHouseAgent } from '@/lib/house/wallets';
import { teamWalletSet } from '@/lib/team/server';
import type { SealedClaim } from '@/lib/seals/document';

/**
 * Read the claims a seal commits to, straight from the sources the
 * public pages read.
 *
 * Deliberately the same calls `/api/v1/agents` makes rather than a
 * private query of its own: a seal that committed to numbers nobody is
 * shown would prove Pokter did not revise a document no one reads. The
 * point is to fix what the site actually says.
 */

/** How many agents one seal covers. The same depth Discover searches. */
export const SEAL_POOL = 400;

export async function readSealClaims(): Promise<SealedClaim[]> {
  const entries = await listSearchable({ limit: SEAL_POOL });
  const team = teamWalletSet();

  return entries.map((entry): SealedClaim => {
    const { listing, record } = entry;
    const quote = listing.quote ?? null;
    return {
      chainId: listing.agent.chain_id,
      tokenId: listing.agent.token_id,
      verdict: verdictFor(entry),
      category: listing.category,
      probes: { total: record.totalProbes, answered: record.totalAnswered },
      /* Floored: the serialiser refuses fractions, and a seal that
         rounded 29.76 days to 30 would claim an observation window that
         had not finished. */
      observedDays: Math.floor(record.observedDays),
      priceRaw: quote ? quote.priceRaw : null,
      priceCurrency: quote ? quote.currency : null,
      attestations: listing.attestationCount,
      /*
       * Deliberately broader than the site's "Run by Pokter" label, which
       * marks the house agents alone. A seal is answering a narrower
       * question than the catalogue's — does Pokter have a stake in this
       * verdict — and it does for an agent it merely owns as operator just
       * as much as for one it runs as a product. Erring toward disclosure
       * is the only direction that costs Pokter rather than a reader.
       */
      houseOperated:
        isHouseAgent(listing.agent)
        || Boolean(listing.agent.owner_address && team.has(listing.agent.owner_address.toLowerCase())),
    };
  });
}
