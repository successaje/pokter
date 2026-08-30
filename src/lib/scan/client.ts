import 'server-only';

import type { ChainId, ScanAgent, ScanFeedback, ScanPage } from './types';

const BASE_URL = process.env.SCAN_BASE_URL ?? 'https://api.8004scan.io/api/v1';

/**
 * Optional. 8004scan serves anonymous traffic at 30 req/min; a hackathon Pro key
 * lifts that to 3,000. The key is read here, server-side only, and never reaches
 * the browser — per 8004scan's own guidance.
 */
const API_KEY = process.env.SCAN_API_KEY;

/** Registry data changes slowly; cache to stay far inside the rate limit. */
const REVALIDATE_SECONDS = 60;

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

async function scanFetch<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  revalidate = REVALIDATE_SECONDS,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
    },
    next: { revalidate },
  });

  if (!response.ok) {
    throw new ScanError(
      response.status,
      path,
      `8004scan ${path} returned ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
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

export function getAgent(chainId: ChainId, tokenId: string): Promise<ScanAgent> {
  return scanFetch<ScanAgent>(`/agents/${chainId}/${tokenId}`, {});
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
  return scanFetch<ScanPage<ScanAgent>>('/agents/search/semantic', {
    q: query,
    chain_id: chainId,
    limit,
  });
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
