import 'server-only';

import type {
  ChainId,
  ScanAgent,
  ScanAgentDetail,
  ScanFeedback,
  ScanPage,
} from './types';

const BASE_URL = process.env.SCAN_BASE_URL ?? 'https://api.8004scan.io/api/v1';

/**
 * Optional. 8004scan serves anonymous traffic at 30 req/min; a hackathon Pro key
 * lifts that to 3,000. The key is read here, server-side only, and never reaches
 * the browser — per 8004scan's own guidance.
 */
const API_KEY = process.env.SCAN_API_KEY;

/** Registry data changes slowly; cache to stay far inside the rate limit. */
const REVALIDATE_SECONDS = 300;

export class ScanError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = 'ScanError';
  }
}

/** How many times to wait out a rate limit before giving up. */
const MAX_RATE_LIMIT_RETRIES = 2;

/**
 * Ceiling on how long we will wait for a rate-limit window to reset.
 *
 * Deliberately far below the 60s window the API reports. Waiting out a full
 * window made a cold page load take 76 seconds, which is worse than rendering
 * with fewer results: callers already treat a failed query as "no results from
 * this query" rather than an error, so a page degrades to a smaller candidate
 * set and the next request — by then inside a fresh window, and served from the
 * fetch cache — is complete.
 *
 * Setting SCAN_API_KEY raises the limit from 30 to 3,000 requests a minute and
 * makes this path essentially unreachable.
 */
const MAX_BACKOFF_MS = 8_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * In-flight request coalescing.
 *
 * Next's fetch cache only helps once a response has arrived. Concurrent renders
 * — several browser tabs, a reload during a slow load, or the dev server's own
 * polling — all miss that empty cache together and each issue the same query.
 * With semantic search taking 3-9s, a handful of simultaneous renders turn into
 * dozens of identical vector queries that contend with each other and make the
 * page slower the more people look at it.
 *
 * Keyed by resolved URL, so identical concurrent requests share one promise and
 * the map is cleared as soon as it settles — this is a stampede guard, not a
 * cache, and correctness still comes from the fetch layer's revalidation.
 */
const inFlight = new Map<string, Promise<unknown>>();

async function scanFetch<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  revalidate = REVALIDATE_SECONDS,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [param, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(param, String(value));
  }

  const key = url.toString();
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const request = (async (): Promise<T> => {
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
        },
        next: { revalidate },
      });

      if (response.ok) return (await response.json()) as T;

      // The response reports when the limit window resets, so a retry waits —
      // but only briefly. See MAX_BACKOFF_MS for why waiting out the full
      // window is worse than rendering with fewer results.
      if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        const resetSeconds = Number(response.headers.get('x-ratelimit-reset'));
        const suggested =
          Number.isFinite(resetSeconds) && resetSeconds > 0
            ? (resetSeconds + 1) * 1000
            : 2 ** attempt * 1_000;

        await sleep(Math.min(suggested, MAX_BACKOFF_MS));
        continue;
      }

      if (response.status === 429) {
        // Logged rather than swallowed: a page quietly rendering fewer agents
        // because of rate limiting should be visible to whoever runs this.
        console.warn(
          `[8004scan] rate limited on ${path} after ${MAX_RATE_LIMIT_RETRIES} retries; ` +
            'rendering with partial results. Set SCAN_API_KEY to raise the limit.',
        );
      }

      throw new ScanError(
        response.status,
        path,
        `8004scan ${path} returned ${response.status} ${response.statusText}`,
      );
    }
  })();

  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

export interface ListAgentsOptions {
  chainId?: ChainId;
  limit?: number;
  offset?: number;
  /** Free-text filter applied by the API across name and description. */
  search?: string;
  sortBy?: 'total_score' | 'created_at' | 'total_feedbacks';
  sortOrder?: 'asc' | 'desc';
  ownerAddress?: string;
}

export function listAgents({
  chainId,
  limit = 40,
  offset = 0,
  search,
  sortBy = 'total_score',
  sortOrder = 'desc',
  ownerAddress,
}: ListAgentsOptions = {}): Promise<ScanPage<ScanAgent>> {
  return scanFetch<ScanPage<ScanAgent>>('/agents', {
    chain_id: chainId,
    limit,
    offset,
    search,
    sort_by: sortBy,
    sort_order: sortOrder,
    owner_address: ownerAddress,
  });
}

/**
 * Full agent record. Unlike a list row this includes `tags` (what we classify
 * on), `services` (the endpoints we probe live), and 8004scan's own health
 * breakdown, so the detail page never has to guess.
 */
/** Registry-wide totals, used for the ecosystem panel. Never estimated. */
export function countAgents(chainId: ChainId): Promise<ScanPage<ScanAgent>> {
  // The API returns the full match count alongside a page, so a single-item
  // page is the cheapest way to read the total.
  return scanFetch<ScanPage<ScanAgent>>(
    '/agents',
    { chain_id: chainId, limit: 1 },
    900,
  );
}

export function getAgent(
  chainId: ChainId,
  tokenId: string,
): Promise<ScanAgentDetail> {
  return scanFetch<ScanAgentDetail>(`/agents/${chainId}/${tokenId}`, {});
}

/**
 * Natural-language agent search. 8004scan runs hybrid vector + keyword matching,
 * which is how the marketplace answers intent queries ("protect me from
 * liquidation") without us standing up our own embedding index.
 */
export function searchAgents(
  query: string,
  { chainId, limit = 24 }: { chainId?: ChainId; limit?: number } = {},
): Promise<ScanPage<ScanAgent>> {
  // Cached far longer than other reads. Semantic search runs a vector query and
  // measures 3-9s per call — an order of magnitude slower than keyword search —
  // while the queries themselves are fixed strings whose results shift slowly.
  // Paying that latency once an hour is the difference between a fast page and
  // a thirty-second one.
  return scanFetch<ScanPage<ScanAgent>>(
    '/agents/search/semantic',
    { q: query, chain_id: chainId, limit },
    3600,
  );
}

/**
 * Feedback is the receipts substrate: each row is an on-chain attestation with a
 * transaction hash, so every performance number the UI shows can be traced back
 * to a block. Cached briefly since this is the freshest signal we display.
 */
export function listFeedbacks({
  chainId,
  agentId,
  limit = 50,
  offset = 0,
}: {
  chainId?: ChainId;
  agentId?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<ScanPage<ScanFeedback>> {
  return scanFetch<ScanPage<ScanFeedback>>(
    '/feedbacks',
    { chain_id: chainId, agent_id: agentId, limit, offset },
    20,
  );
}
