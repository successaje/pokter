import 'server-only';

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
export async function fetchDeclaredCapabilities(
  endpoint: string | null | undefined,
  tokenId: string,
): Promise<DeclaredSkill[]> {
  if (!endpoint) return [];
  const resolved = endpoint.replace('{agentId}', tokenId);

  try {
    const card = await withPublicEndpoint(resolved, async (handle) => {
      const response = await handle.fetch({
        headers: { accept: 'application/json' },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(2_500),
      });
      if (!response.ok) return null;
      return await readJson(response);
    });

    if (typeof card !== 'object' || card === null) return [];
    return declaredCapabilities((card as Record<string, unknown>).skills);
  } catch {
    return [];
  }
}
