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

/**
 * One item per agent, preferring the mainnet registration.
 *
 * `firstPerAgent` kept whichever registration ranked higher, and a new
 * mainnet listing has no record yet while its testnet twin already has
 * deliveries, so the testnet one won every time and a mainnet agent could
 * only be found by filtering to BNB Chain. The agent keeps the place its
 * best registration earned; the row shown is its mainnet one, and the
 * other networks it is on are returned so the row can say so.
 */
export function mainnetFirstPerAgent<T>(items: T[], agentOf: (item: T) => AgentIdentity): { items: T[]; alsoOn: Map<T, number[]> } {
  const groups = new Map<string, T[]>();
  const order: string[] = [];
  for (const item of items) {
    const key = agentIdentityKey(agentOf(item));
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(item);
  }
  const alsoOn = new Map<T, number[]>();
  const picked = order.map((key) => {
    const group = groups.get(key)!;
    const chosen = group.find((item) => agentOf(item).chain_id === 56) ?? group[0];
    const others = [...new Set(group.filter((item) => item !== chosen).map((item) => agentOf(item).chain_id))];
    if (others.length) alsoOn.set(chosen, others);
    return chosen;
  });
  return { items: picked, alsoOn };
}
