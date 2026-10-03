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
