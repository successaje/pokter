import { REGISTRY_ABI, registryAddress, registryClient, registryTokenUri } from '@/lib/registry/onchain';

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
  /* The catalogue's read first, so a card and its agent page show the same picture. */
  const known = catalogueImages.get(`${chainId}:${tokenId}`);
  if (known?.image) return known.image;
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

/**
 * Registered images for the whole catalogue, read in one batch.
 *
 * The catalogue used to keep the indexer's `image_url` because reading the
 * registry meant one RPC call per card. That URL is 8004scan's media proxy,
 * fetched by each visitor's browser, and it rate-limits by address at a
 * thousand requests a day: a Discover page asks for about seventy, so an
 * active visitor ran out and every proxied card fell back to rings. On 23
 * October 48 of the 68 proxied cards had a working image of their own on
 * chain, the five house agents among them; their pages, which read the
 * registry, showed it, and their cards did not.
 *
 * `tokenURI` for every agent is one Multicall per chain, and an agent that
 * publishes its profile at a URL has that profile fetched once, with a
 * short timeout. Held for `CATALOGUE_IMAGE_FRESH_MS` and refreshed in the
 * background, so no page waits on it. A read that fails keeps the value it
 * had; a new process starts empty and the cards use the indexer's image
 * until the first read lands, which is what they did before.
 */
export const CATALOGUE_IMAGE_FRESH_MS = 30 * 60_000;
const PROFILE_TIMEOUT_MS = 4_000;
const MULTICALL_BATCH = 200;

type CatalogueImage = { image: string | null };
const catalogueImages = new Map<string, CatalogueImage>();
/* When each agent was last asked about, found or not: an unreadable one waits its turn like the rest. */
const attempted = new Map<string, number>();
let refreshing: Promise<void> | null = null;

/** The `image` of a hosted registration profile, or null. https and ipfs only; nothing else is fetched. */
async function hostedProfileImage(uri: string): Promise<string | null> {
  const url = uri.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${uri.slice('ipfs://'.length)}` : safeImageUrl(uri);
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS), redirect: 'follow' });
    if (!response.ok) return null;
    const text = await response.text();
    if (text.length > 200_000) return null;
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? safeImageUrl((parsed as { image?: unknown }).image) : null;
  } catch {
    return null;
  }
}

/** One chain's registered images, by token id. Missing ids were not readable this time. */
export async function readRegisteredImages(chainId: number, tokenIds: readonly string[]): Promise<Map<string, string | null>> {
  const client = registryClient(chainId);
  const address = registryAddress(chainId);
  const found = new Map<string, string | null>();
  if (!client || !address || tokenIds.length === 0) return found;
  const hosted: Array<[string, string]> = [];
  for (let start = 0; start < tokenIds.length; start += MULTICALL_BATCH) {
    const ids = tokenIds.slice(start, start + MULTICALL_BATCH);
    const results = await client
      .multicall({ allowFailure: true, contracts: ids.map((id) => ({ address, abi: REGISTRY_ABI, functionName: 'tokenURI' as const, args: [BigInt(id)] })) })
      .catch(() => null);
    if (!results) continue;
    results.forEach((result, i) => {
      if (result.status !== 'success' || typeof result.result !== 'string') return;
      const uri = result.result;
      if (uri.startsWith('data:')) found.set(ids[i], imageFromAgentUri(uri));
      else if (/^(https:|ipfs:)/.test(uri)) hosted.push([ids[i], uri]);
      else found.set(ids[i], null);
    });
  }
  /* Eight at a time: a slow publisher host holds up its own row, not the batch. */
  for (let start = 0; start < hosted.length; start += 8) {
    await Promise.all(
      hosted.slice(start, start + 8).map(async ([id, uri]) => {
        found.set(id, await hostedProfileImage(uri));
      }),
    );
  }
  return found;
}

type ImageReader = (chainId: number, tokenIds: readonly string[]) => Promise<Map<string, string | null>>;

async function refreshCatalogueImages(agents: ReadonlyArray<{ chainId: number; tokenId: string }>, read: ImageReader): Promise<void> {
  const byChain = new Map<number, string[]>();
  for (const { chainId, tokenId } of agents) byChain.set(chainId, [...(byChain.get(chainId) ?? []), tokenId]);
  for (const [chainId, ids] of byChain) {
    const found = await read(chainId, ids).catch(() => new Map<string, string | null>());
    for (const [tokenId, image] of found) catalogueImages.set(`${chainId}:${tokenId}`, { image });
  }
}

/**
 * The registered image for each agent, as far as it is known now, and a
 * refresh started in the background when the oldest is stale. Never waits.
 */
export function catalogueImagesFor(
  agents: ReadonlyArray<{ chainId: number; tokenId: string }>,
  { read = readRegisteredImages, now = Date.now() }: { read?: ImageReader; now?: number } = {},
): Map<string, string | null> {
  const known = new Map<string, string | null>();
  let stale = false;
  for (const { chainId, tokenId } of agents) {
    const key = `${chainId}:${tokenId}`;
    const hit = catalogueImages.get(key);
    if (hit) known.set(key, hit.image);
    const asked = attempted.get(key);
    if (asked === undefined || now - asked > CATALOGUE_IMAGE_FRESH_MS) stale = true;
  }
  if (stale && !refreshing) {
    for (const { chainId, tokenId } of agents) attempted.set(`${chainId}:${tokenId}`, now);
    const started = Date.now();
    refreshing = refreshCatalogueImages(agents, read)
      .then(() => {
        if (process.env.NODE_ENV !== 'test') console.info(`[timing] catalogue.images agents=${agents.length} elapsed=${Date.now() - started}ms`);
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return known;
}

/** For tests: forget everything read so far. */
export function resetCatalogueImages(): void {
  catalogueImages.clear();
  attempted.clear();
  refreshing = null;
}

/** For tests: wait for a refresh in flight. */
export function catalogueImagesSettled(): Promise<void> {
  return refreshing ?? Promise.resolve();
}
