import { isHouseAgent } from '@/lib/house/wallets';

/** Minimal shape shared by list and detail registry responses. */
export interface AgentIdentityText {
  name?: string | null;
  description?: string | null;
}

const NON_PRODUCTION_MARKERS = [
  'test deployment',
  'not for production',
  'retired duplicate',
  'deprecated duplicate',
];

/**
 * Names that identify a draft rather than a service.
 *
 * Matched against the whole trimmed name, not as a substring, so a real
 * agent called "Liquidation Test Harness" is unaffected while "My Testnet
 * Agent 02" is not promoted. A trailing index is stripped first because the
 * placeholder names that reach the registry are almost always numbered.
 */
const PLACEHOLDER_NAMES = [
  'agent',
  'my agent',
  'test agent',
  'test',
  'testnet agent',
  'my test agent',
  'my testnet agent',
  'new agent',
  'untitled agent',
  'untitled',
  'example agent',
  'demo agent',
  'sample agent',
  'default agent',
];

/**
 * A publisher's own "(test)" or "(demo)" suffix, taken at its word.
 *
 * "BNB Grid Trader (test)" and "LingoAI Yield Optimiser (demo)" are both live
 * listings whose authors said in the name that they are not the real thing.
 * Only a trailing parenthetical counts, so an agent whose name genuinely ends
 * in a qualifier — "Health Factor Monitor (Venus)" — is untouched.
 */
const SELF_DECLARED_DRAFT = /\((?:test|testing|demo|draft|wip|sandbox|staging|example|sample|placeholder)\)\s*$/i;

function looksLikePlaceholderName(name: string): boolean {
  const bare = name
    .trim()
    .toLowerCase()
    .replace(/[\s_-]*#?\d+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!bare) return true;
  return PLACEHOLDER_NAMES.includes(bare);
}

/**
 * Whether an agent may be actively promoted by Pokter.
 *
 * Non-production identities remain visible in the complete registry-derived
 * catalogue. They are excluded only from surfaces that imply a recommendation:
 * homepage picks, guided matches, alternatives and similar-agent rails.
 */
export function isPromotableAgent(agent: AgentIdentityText): boolean {
  const name = agent.name ?? '';
  if (looksLikePlaceholderName(name)) return false;
  if (SELF_DECLARED_DRAFT.test(name.trim())) return false;

  const published = `${name} ${agent.description ?? ''}`.toLowerCase();
  return !NON_PRODUCTION_MARKERS.some((marker) => published.includes(marker));
}

/**
 * Whether an agent has a name a buyer can read, as opposed to an identifier.
 *
 * Lowercase words joined by hyphens ("marketplace-operated-grid-planner")
 * are a slug, usually another system's internal id. Such agents stay listed
 * and counted, but the places Pokter features agents (the home page's
 * strips and spotlight, the campaign guide, the evaluation queue) pick ones
 * a reader can recognise and judge by name.
 */
export function hasDisplayName(agent: AgentIdentityText): boolean {
  const name = (agent.name ?? '').trim();
  if (!name) return false;
  return !/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(name);
}

/**
 * Promotable, and named for a reader: the bar for being featured.
 *
 * Never an agent Pokter runs itself. Its house agents are listed and
 * measured like anyone's, but a marketplace recommending its own agents in
 * the places it calls neutral (the guide's picks, the spotlight, the home
 * strip) would be the thumb on the scale it exists to show in others.
 */
export function isFeaturableAgent(agent: AgentIdentityText & { owner_address?: string | null; agent_wallet?: string | null }): boolean {
  return isPromotableAgent(agent) && hasDisplayName(agent) && !isHouseAgent(agent);
}
