/**
 * Whether an A2A agent card says its endpoint needs credentials.
 *
 * A card's `security` lists the requirements a caller must meet, one of
 * which is enough; an empty requirement means anonymous calls are allowed.
 * So the endpoint needs a login when `security` names at least one
 * requirement and none of them is empty. `securitySchemes` alone only defines
 * schemes and requires nothing, so it does not count.
 *
 * This matters because the card itself is public: an agent whose work
 * endpoint refuses anonymous callers answers every probe, and Pokter cannot
 * carry a task to it or tell it a job is funded.
 */
export function cardRequiresAuth(card: unknown): boolean {
  if (!card || typeof card !== 'object') return false;
  const security = (card as { security?: unknown }).security;
  if (!Array.isArray(security) || security.length === 0) return false;
  return security.every(
    (requirement) =>
      requirement !== null &&
      typeof requirement === 'object' &&
      Object.keys(requirement as Record<string, unknown>).length > 0,
  );
}

/**
 * Where to look for an A2A agent card when the endpoint given is not one.
 *
 * Builders often publish their service's base URL rather than the card, and
 * the A2A specification puts the card at a well-known path under the host.
 * Reading only the URL given failed a working agent whose root returns an
 * index naming its card. The index's own pointer is followed when it has one
 * (`agentCard`); otherwise the well-known path at the host's root. Null when
 * the endpoint already is the well-known card, so nothing loops.
 */
export function a2aCardFallback(endpoint: string, body?: unknown): string | null {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (/\/\.well-known\/agent(-card)?\.json$/.test(url.pathname)) return null;

  const pointer =
    body && typeof body === 'object'
      ? ((body as Record<string, unknown>).agentCard ?? (body as Record<string, unknown>).agent_card)
      : undefined;
  if (typeof pointer === 'string' && pointer.trim()) {
    try {
      const resolved = new URL(pointer.trim(), url);
      // Only the same host: an index cannot send Pokter somewhere else.
      if (resolved.host === url.host && resolved.href !== url.href) return resolved.href;
    } catch {
      /* Fall through to the well-known path. */
    }
  }
  return new URL('/.well-known/agent-card.json', url.origin).href;
}
