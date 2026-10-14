import 'server-only';

import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex, LocalAccount } from 'viem';

import { slugEnvName, type HouseAgentDefinition } from './types';

export class HouseAgentNotConfigured extends Error {
  constructor(definition: Pick<HouseAgentDefinition, 'slug' | 'name'>) {
    super(`${definition.name} has no wallet configured (${slugEnvName(definition.slug)} is not set).`);
    this.name = 'HouseAgentNotConfigured';
  }
}

/**
 * The agent's own wallet, from its own secret.
 *
 * One key per agent, never the operator's: each agent signs its quotes,
 * owns its registration and is paid into its own wallet, so its record on
 * chain is its own and nothing it does spends Pokter's operating funds.
 */
export function houseAccount(definition: Pick<HouseAgentDefinition, 'slug' | 'name'>): LocalAccount {
  const key = process.env[slugEnvName(definition.slug)]?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new HouseAgentNotConfigured(definition);
  return privateKeyToAccount(key as Hex);
}

export function houseWallet(definition: Pick<HouseAgentDefinition, 'slug' | 'name'>): Address | null {
  try {
    return houseAccount(definition).address;
  } catch {
    return null;
  }
}
