import 'server-only';

import { withPublicEndpoint } from '@/lib/proof/prober';

/**
 * A registration profile at the URL its registrant chose, read safely.
 *
 * Anyone can register an agent and point its `tokenURI` at any address, and
 * the catalogue reads every hosted profile on a schedule. It used to fetch
 * them with a plain `fetch` that followed redirects, so a registrant could
 * send Pokter's server to a private address, directly or through a
 * redirect. Every request now goes through `withPublicEndpoint`, the guard
 * the prober uses: public HTTPS only, the resolved address checked and the
 * connection pinned to it.
 *
 * Redirects are followed by hand, at most `MAX_REDIRECTS`, and each hop is
 * checked the same way as the first, because profile hosts and IPFS
 * gateways do redirect, and refusing them outright would drop real images.
 * The body is read up to `MAX_BYTES` and no further.
 */
const MAX_REDIRECTS = 3;
const MAX_BYTES = 200_000;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

type Endpoint = typeof withPublicEndpoint;
type Step = { body: unknown } | { next: string | null };

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

/** The parsed profile, or null for anything unreadable, refused, too large or redirected too often. */
export async function readHostedProfile(url: string, { timeoutMs, endpoint = withPublicEndpoint }: { timeoutMs: number; endpoint?: Endpoint }): Promise<unknown> {
  const signal = AbortSignal.timeout(timeoutMs);
  let target = url;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const step: Step = await endpoint(target, async (pinned) => {
        const response = await pinned.fetch({ headers: { accept: 'application/json' }, redirect: 'manual', signal });
        if (REDIRECTS.has(response.status)) {
          await response.body?.cancel();
          const location = response.headers.get('location');
          return { next: location ? new URL(location, target).href : null };
        }
        if (!response.ok) {
          await response.body?.cancel();
          return { body: null };
        }
        return { body: await boundedJson(response) };
      });
      if ('body' in step) return step.body;
      if (!step.next) return null;
      target = step.next;
    }
    return null;
  } catch {
    /* Refused by the guard, timed out, or the host failed: no profile. */
    return null;
  }
}
