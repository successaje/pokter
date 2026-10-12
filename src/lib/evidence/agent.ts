import { EVIDENCE_CHAINS } from '@/lib/evidence/refs';
import type { ChainId } from '@/lib/scan/types';

/*
 * No `server-only` here, and the chain list comes from `refs` rather than
 * `marketplace`.
 *
 * This file is the agent's own terms — a card, a price, a currency — and
 * none of it reads a database. Importing the marketplace module for one
 * constant pulled `server-only` in behind it and made the terms
 * untestable, which is the wrong trade for a file whose entire job is to
 * be consistent with two other files.
 *
 * The escrow token is passed in rather than looked up for the same
 * reason: resolving it imports the Altana SDK, whose export map does not
 * load outside Next, and the caller already knows which chain it is
 * pricing for. Resolution belongs at the request, where the chain is
 * known; this file only has to spend it consistently.
 */

/**
 * The Pokter evidence agent's own terms.
 *
 * Kept apart from the report so the card, the quote and the handler cannot
 * drift: a card advertising one price while the signed quote names another
 * is the kind of inconsistency this agent exists to detect in others.
 */

export const EVIDENCE_AGENT = {
  name: 'Pokter Evidence',
  version: '1.0.0',
  skillId: 'agent_evidence',
  /** Nominal rather than free: some marketplaces reject an unsigned or zero price. */
  priceU: 0.01,
  deliveryWindowHours: 1,
} as const;

export function evidenceCard(origin: URL) {
  return {
    name: EVIDENCE_AGENT.name,
    description:
      'Reports what Pokter measured about any ERC-8004 agent on BNB Chain: calls taken, calls answered, whether a signed price can be settled, and the provenance of each claim. It reports; it does not rank.',
    url: new URL('/api/evidence/a2a', origin).href,
    version: EVIDENCE_AGENT.version,
    protocolVersion: '0.3.0',
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    provider: { organization: 'Pokter', url: origin.origin },
    skills: [
      {
        /*
          The id is exactly `negotiate`, because that is what Pokter's own
          prober looks for — `negotiationSkillOf` accepts `negotiate` or a
          `negotiate-` prefix and nothing else. An agent that prices its
          work under any other name reads to this marketplace, and to the
          others that follow the same convention, as an agent with no
          price at all.
        */
        id: 'negotiate',
        name: 'Quote a price for an evidence report',
        description:
          'Returns a price signed by this agent’s own wallet, denominated in the payment token of the escrow chain named in the request.',
        tags: ['erc-8183', 'negotiation', 'quote'],
      },
      {
        id: EVIDENCE_AGENT.skillId,
        name: 'Evidence for an ERC-8004 agent',
        description:
          'Give it an agent reference — "56/303779", "eip155:56:303779" or a bare token id — and it returns Pokter\'s measured record for that agent with the provenance of every field, including what Pokter has not measured.',
        tags: ['erc-8004', 'evidence', 'verification', 'bnb-chain'],
        examples: ['56/303779', 'eip155:97:2554'],
      },
    ],
    metadata: {
      /*
       * Both chains, because this agent is meant to be hired from other
       * marketplaces and they do not all settle where Pokter does. The
       * quote is denominated per request against the escrow the caller
       * names; see `quoteTermsFor`.
       */
      supported_chains: EVIDENCE_CHAINS,
      reports_on: EVIDENCE_CHAINS,
      operated_by: 'Pokter',
      ranks_agents: false,
      measures: 'availability and quote settleability, not correctness of the work',
    },
  };
}

/**
 * The price, in the token the caller's escrow can actually settle.
 *
 * One agent listed across marketplaces that settle on different chains
 * cannot hold a single currency constant. Pokter found thirteen listings
 * whose quotes verified perfectly and could never be paid because they
 * named the other chain's token; shipping that same defect in Pokter's
 * own agent would be the most embarrassing possible version of it.
 */
export function quoteTermsFor(chainId: ChainId, paymentToken: string) {
  return {
    price_u: EVIDENCE_AGENT.priceU,
    currency: paymentToken,
    chain_id: chainId,
    delivery_window_hours: EVIDENCE_AGENT.deliveryWindowHours,
  };
}
