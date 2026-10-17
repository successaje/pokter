import 'server-only';

import { withPublicEndpoint } from '@/lib/proof/prober';
import { siteUrl } from '@/lib/site';

/** The largest deliverable Pokter reads, to verify or to grade. */
export const MAX_MANIFEST_BYTES = 256 * 1024;

/**
 * The text served at a deliverable URL, read the way a stranger's URL
 * must be: Pokter's own origin directly, anything else validated and pinned
 * to the address that was checked (POK-008), no redirects, a time limit
 * and a size limit. Shared by receipt verification and paid-check grading,
 * so the two cannot read the same delivery differently.
 */
export async function fetchDeliverableText(url: string): Promise<string> {
  const candidate = new URL(url);
  const init: RequestInit = {
    headers: { accept: 'application/json, text/plain;q=0.9' },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
  };
  const read = async (response: Response): Promise<string> => {
    if (!response.ok) throw new Error(`Deliverable answered ${response.status}`);
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_MANIFEST_BYTES) throw new Error('Deliverable exceeds the 256 KB verification limit');
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_MANIFEST_BYTES) throw new Error('Deliverable exceeds the 256 KB verification limit');
    return text;
  };
  return candidate.origin === new URL(siteUrl()).origin
    ? read(await fetch(candidate, init))
    : withPublicEndpoint(candidate.href, async (pinned) => read(await pinned.fetch(init)));
}
