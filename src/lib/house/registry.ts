import { brinkwatch } from './agents/brinkwatch';
import { cresthold } from './agents/cresthold';
import type { HouseAgentDefinition } from './types';

/**
 * Every house agent Pokter runs. Each is added in its own change, after it
 * has answered real briefs against live chain data.
 */
export const HOUSE_AGENTS: readonly HouseAgentDefinition[] = [brinkwatch, cresthold];

export function houseAgent(slug: string): HouseAgentDefinition | null {
  return HOUSE_AGENTS.find((agent) => agent.slug === slug) ?? null;
}
