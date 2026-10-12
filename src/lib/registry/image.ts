import { registryTokenUri } from '@/lib/registry/onchain';

/**
 * The image an agent actually registered, read from the registry.
 *
 * 8004scan returns an `image_url` pointing at its own media proxy
 * (`/api/v1/media/agents/{chain}/{token}/image`), and that proxy answers
 * 404 for every agent checked — 97/2599, 56/341563, 56/341556. The browser
 * then falls back to Pokter's generated avatar, so a publisher who set an
 * image sees it silently dropped and reasonably concludes Pokter lost it.
 *
 * The registration record itself has the URL the publisher chose, so read
 * it from there. One `tokenURI` call, decoded locally: no indexer in the
 * path, and the answer is the same thing the owner signed.
 *
 * Used only where N is small — one profile, one builder's own list. The
 * catalogue draws 160 rows and keeps the indexer's value, because a dead
 * image there costs an initial rather than 160 RPC reads.
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
 * said. Registry first, because the indexer's URL is a proxy that 404s.
 */
export async function resolveAgentImage(
  chainId: number,
  tokenId: string,
  indexerImageUrl: string | null | undefined,
): Promise<string | null> {
  return (await registryImageUrl(chainId, tokenId)) ?? safeImageUrl(indexerImageUrl);
}
