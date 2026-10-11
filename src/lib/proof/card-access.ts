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
