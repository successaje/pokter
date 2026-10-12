import { registryTokenUri } from '@/lib/registry/onchain';

/**
 * The image an agent actually registered, read from the registry.
 *
 * 8004scan returns an `image_url` pointing at its own media proxy
 * (`/api/v1/media/agents/{chain}/{token}/image`). For some agents that
 * proxy serves a real image; for others it answers 404 — including
 * 97/2599 and 56/341563, both of which registered a perfectly good URL.
 * The browser then falls back to Pokter's generated avatar, so those
 * publishers see their image silently dropped and reasonably conclude
 * Pokter lost it.
 *
 * The registration record itself has the URL the publisher chose, so read
 * it from there first. One `tokenURI` call, decoded locally: no indexer
 * in the path, and the answer is the same thing the owner signed.
 *
 * Used only where N is small — a profile and its three alternatives, a
 * builder's own list, up to four agents being compared. The catalogue
 * draws 160 rows and keeps the indexer's value, because a dead image
 * there costs an initial rather than 160 RPC reads.
 */

/** Only https, and nothing carrying credentials. */
export function safeImageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2000) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * The `image` field of an ERC-8004 registration file, from its URI.
 *
 * Handles the `data:` form the SDK writes, which is what Pokter and the
 * SDK's own `encodeErc8004AgentUri` produce. An external `https` profile
 * URL is not followed: that is a fetch of a third-party document on every
 * page render, and the registry record is what this function is for.
 */
export function imageFromAgentUri(agentUri: string): string | null {
  if (!agentUri.startsWith('data:')) return null;
  const comma = agentUri.indexOf(',');
  if (comma < 0) return null;
  const head = agentUri.slice(0, comma);
  const body = agentUri.slice(comma + 1);
  try {
    const json = head.includes(';base64')
      ? Buffer.from(body, 'base64').toString('utf8')
      : decodeURIComponent(body);
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    return safeImageUrl((parsed as { image?: unknown }).image);
  } catch {
    return null;
  }
}

/* One read per agent per process. Registration images change rarely, and a
   miss costs only the generated avatar until the next deploy. */
const cache = new Map<string, string | null>();

export async function registryImageUrl(chainId: number, tokenId: string): Promise<string | null> {
  const key = `${chainId}:${tokenId}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  /* A failed read returns null uncached: a flaky RPC call should not pin
     "no image" for the lifetime of the process. */
  const uri = await registryTokenUri(chainId, tokenId);
  if (uri === null) return null;

  const image = imageFromAgentUri(uri);
  cache.set(key, image);
  return image;
}

/**
 * The image to draw: what the publisher registered, else what the indexer
 * said.
 *
 * Registry first, because it is authoritative and the proxy misses. The
 * indexer stays as the fallback and earns its place: it resolves the
 * `ipfs://` and external-profile records this deliberately does not
 * follow, and for those agents its URL is the only working image on the
 * page. A fallback that 404s costs one request and then the generated
 * mark, which `AvatarImage` already draws on a failed load.
 */
export async function resolveAgentImage(
  chainId: number,
  tokenId: string,
  indexerImageUrl: string | null | undefined,
): Promise<string | null> {
  return (await registryImageUrl(chainId, tokenId)) ?? safeImageUrl(indexerImageUrl);
}

/**
 * The same resolution for a handful of rows, read concurrently.
 *
 * Every caller is a page with a short list on it, so the reads overlap
 * rather than queue; a failed read for one row leaves the others alone
 * and falls back to the indexer's value, which is what the single-row
 * version does.
 */
export function resolveAgentImages<T extends { chain_id: number; token_id: string; image_url: string | null }>(
  rows: readonly T[],
): Promise<Array<string | null>> {
  return Promise.all(
    rows.map((row) =>
      resolveAgentImage(row.chain_id, row.token_id, row.image_url).catch(() => safeImageUrl(row.image_url)),
    ),
  );
}
