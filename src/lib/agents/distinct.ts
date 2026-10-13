/**
 * Agents counted once, however many chains they are registered on.
 *
 * Builders often register the same agent on mainnet and on testnet, under
 * the same name from the same owner. Counting each registration made the
 * home page's headline figures larger than the number of agents a buyer can
 * actually choose between. The same owner and the same name, ignoring case
 * and surrounding space, is one agent.
 */
type AgentIdentity = { owner_address: string; name?: string | null; chain_id: number; token_id: string };

/** The key one agent shares across its registrations. */
export function agentIdentityKey(agent: AgentIdentity): string {
  const name = (agent.name ?? '').trim().toLowerCase();
  // Unnamed agents cannot be matched across chains, so each stands alone.
  return name ? `${agent.owner_address.toLowerCase()}|${name}` : `${agent.chain_id}:${agent.token_id}`;
}

export function distinctAgentCount(agents: AgentIdentity[]): number {
  return new Set(agents.map(agentIdentityKey)).size;
}

/** The first registration of each agent, in the order given. */
export function firstPerAgent<T>(items: T[], agentOf: (item: T) => AgentIdentity): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = agentIdentityKey(agentOf(item));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
