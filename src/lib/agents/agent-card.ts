import 'server-only';

import { a2aCardFallback } from '@/lib/proof/card-access';
import { readJson, withPublicEndpoint } from '@/lib/proof/prober';
import { declaredCapabilities, type DeclaredSkill } from './capabilities';

/**
 * Reads an agent's own Agent Card and returns the capabilities it advertises.
 *
 * Fetched through `withPublicEndpoint`, the same guarded fetcher the prober
 * and the trial use: the endpoint is pinned to a public address, the body is
 * size-capped and redirects are refused. An agent endpoint is a third party
 * and is treated as one.
 *
 * Never throws and never blocks the page. A card that is slow, missing,
 * malformed or hostile returns an empty list and the caller falls back to
 * the registry description — which is what every agent showed before this
 * existed, so the failure mode is simply the old behaviour.
 *
 * The timeout is deliberately shorter than the prober's. This runs while
 * somebody is waiting for a page, not inside a sweep. Of the 66 listed
 * agents that publish an endpoint, 53 answer; the other 13 would hold the
 * page for however long this waits, and a capability line is not worth
 * several seconds of blank heading. A healthy card comes back well inside
 * a second — the live negotiation trial against the same endpoints
 * completes in under one — so 2.5s accepts the ones that work and gives up
 * quickly on the ones that do not.
 */
function isCard(body: unknown): body is Record<string, unknown> {
  return (
    typeof body === 'object' &&
    body !== null &&
    Array.isArray((body as Record<string, unknown>).skills) &&
    typeof (body as Record<string, unknown>).url === 'string'
  );
}

async function fetchJson(url: string, timeoutMs: number): Promise<{ status: number; body: unknown }> {
  return withPublicEndpoint(url, async (handle) => {
    const response = await handle.fetch({
      headers: { accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: response.status, body: response.ok ? await readJson(response).catch(() => null) : null };
  });
}

/**
 * An agent's A2A card, read the way the prober reads it.
 *
 * The URL given is tried first; if it answers with something other than a
 * card (a service's base URL, an index page), the card's location is tried
 * once (`a2aCardFallback`). Every path that talks to an agent reads its card
 * through this, so an agent that passes Pokter's check can also be quoted,
 * asked and hired. Throws when neither yields a card.
 */
export async function readAgentCard(endpoint: string, { timeoutMs = 8_000 }: { timeoutMs?: number } = {}): Promise<Record<string, unknown>> {
  const first = await fetchJson(endpoint, timeoutMs);
  if (isCard(first.body)) return first.body;
  const fallback = a2aCardFallback(endpoint, first.body);
  if (fallback) {
    const second = await fetchJson(fallback, timeoutMs).catch(() => null);
    if (second && isCard(second.body)) return second.body;
  }
  throw new Error(first.status >= 200 && first.status < 300 ? 'The endpoint answered, but not with an agent card.' : `The agent card answered ${first.status}.`);
}

export async function fetchDeclaredCapabilities(
  endpoint: string | null | undefined,
  tokenId: string,
): Promise<DeclaredSkill[]> {
  if (!endpoint) return [];
  const resolved = endpoint.replace('{agentId}', tokenId);

  try {
    const card = await readAgentCard(resolved, { timeoutMs: 2_500 });
    return declaredCapabilities(card.skills);
  } catch {
    return [];
  }
}
