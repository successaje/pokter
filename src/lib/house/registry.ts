import { brinkwatch } from './agents/brinkwatch';
import { centreline } from './agents/centreline';
import { cresthold } from './agents/cresthold';
import { gridloom } from './agents/gridloom';
import type { HouseAgentDefinition } from './types';

/**
 * Every house agent Pokter runs. Each is added in its own change, after it
 * has answered real briefs against live chain data.
 */
export const HOUSE_AGENTS: readonly HouseAgentDefinition[] = [brinkwatch, cresthold, centreline, gridloom];

export function houseAgent(slug: string): HouseAgentDefinition | null {
  return HOUSE_AGENTS.find((agent) => agent.slug === slug) ?? null;
}
