import { builtWithPokter } from '@/lib/brand/built-with';

import { HOUSE_CHAINS, type HouseAgentDefinition, type HouseChainId } from './types';

/** The agent's A2A endpoint, per chain when one is named. */
export function houseEndpoint(definition: Pick<HouseAgentDefinition, 'slug'>, origin: URL, chainId?: HouseChainId): URL {
  const endpoint = new URL(`/api/house/${definition.slug}/a2a`, origin);
  if (chainId) endpoint.searchParams.set('chain', String(chainId));
  return endpoint;
}

/**
 * The A2A agent card.
 *
 * `negotiate` and `notify_funded` are named exactly as Pokter's prober and
 * the reference sellers expect. The work skill carries example briefs:
 * no seller Pokter has hired published any, and the one that answered
 * nine one-line questions errored on a five-line brief.
 */
export function houseCard(definition: HouseAgentDefinition, origin: URL, chainId?: HouseChainId) {
  return {
    name: definition.name,
    description: definition.description,
    url: houseEndpoint(definition, origin, chainId).href,
    version: definition.version,
    protocolVersion: '0.3.0',
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json'],
    provider: { organization: 'Pokter', url: origin.origin },
    skills: [
      {
        id: 'negotiate',
        name: `Quote a price for ${definition.name}`,
        description:
          'Send {"skill": "negotiate", "task_description": "..."} and receive a quote signed by this agent’s own wallet, in the payment token of the escrow chain named in the request. A brief this agent cannot answer is declined here, before any money moves, with what it needs instead.',
        tags: ['erc-8183', 'negotiation', 'quote'],
      },
      {
        id: 'notify_funded',
        name: 'Accept a funded job and deliver it',
        description:
          'After funding, send {"skill": "notify_funded", "job_id": <int>, "chain_id": 56 or 97}. The agent re-reads the escrow, does the work and submits the deliverable on chain before it answers, so the reply can take up to a minute.',
        tags: ['erc-8183', 'delivery', 'escrow'],
      },
      {
        id: definition.skill.id,
        name: definition.skill.name,
        description: `${definition.skill.description} Calling this skill directly returns a free preview: whether the brief can be answered and what a hire would return.`,
        tags: definition.skill.tags,
        examples: definition.skill.examples,
      },
    ],
    metadata: {
      category: definition.category,
      price_u: definition.priceU,
      supported_chains: HOUSE_CHAINS,
      ...(chainId ? { settles_on: chainId } : {}),
      operated_by: 'Pokter',
      ...builtWithPokter,
      reads_only: true,
      payment:
        'Escrowed per job. On BNB Chain mainnet the escrow releases payment after its 7-day review window, unless the buyer disputes.',
    },
  };
}
