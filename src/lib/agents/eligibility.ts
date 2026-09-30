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
 * Whether an agent may be actively promoted by Pokter.
 *
 * Non-production identities remain visible in the complete registry-derived
 * catalogue. They are excluded only from surfaces that imply a recommendation:
 * homepage picks, guided matches, alternatives and similar-agent rails.
 */
export function isPromotableAgent(agent: AgentIdentityText): boolean {
  const published = `${agent.name ?? ''} ${agent.description ?? ''}`.toLowerCase();
  return !NON_PRODUCTION_MARKERS.some((marker) => published.includes(marker));
}
