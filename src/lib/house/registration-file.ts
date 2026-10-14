import type { Erc8004RegistrationFile } from '@altananetwork/sdk';

import { CATEGORIES } from '@/lib/agents/categories';
import { builtWithPokter } from '@/lib/brand/built-with';

import type { HouseAgentDefinition, HouseChainId } from './types';

/** The ERC-8004 registration file: the per-chain card as its A2A endpoint, and its maker. */
export function houseRegistrationFile(definition: HouseAgentDefinition, chainId: HouseChainId, origin: URL): Erc8004RegistrationFile {
  const listed = CATEGORIES.some((category) => category.id === definition.category);
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: definition.name,
    description: definition.description,
    image: new URL(`/api/avatars/${definition.slug}`, origin).href,
    services: [{ name: 'A2A', endpoint: new URL(`/house/${definition.slug}/${chainId}/.well-known/agent-card.json`, origin).href }],
    registrations: [],
    tags: listed ? [definition.category] : [],
    categories: listed ? [definition.category] : [],
    x402Support: false,
    active: true,
    supportedTrust: ['reputation'],
    ...builtWithPokter,
  } as Erc8004RegistrationFile;
}

