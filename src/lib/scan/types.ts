/**
 * Wire types for the 8004scan API (https://api.8004scan.io/api/v1).
 * These mirror the live response shapes verified against the running service —
 * fields are optional where the API returns null for most rows.
 */

export type ChainId = 56 | 97;

export const BSC_MAINNET: ChainId = 56;
export const BSC_TESTNET: ChainId = 97;

/** A row from `GET /agents`. */
export interface ScanAgent {
  id: string;
  /** Composite "chainId:contract:tokenId" identifier. */
  agent_id: string;
  token_id: string;
  chain_id: number;
  chain_type: string;
  contract_address: string;
  is_testnet: boolean;
  owner_address: string;
  owner_ens: string | null;
  owner_username: string | null;
  owner_publisher_tier: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  is_verified: boolean;
  star_count: number;
  supported_protocols: string[] | null;
  x402_supported: boolean;
  total_score: number;
  rank: number | null;
  network_rank: number | null;
  health_score: number | null;
  total_feedbacks: number;
  average_score: number;
  /** Present on detail rows; list rows omit it. */
  tags?: string[] | null;
  created_at: string;
  updated_at: string;
}

/** A service endpoint the agent publishes, and which we can therefore probe. */
export interface ScanService {
  endpoint?: string | null;
  version?: string | null;
  skills?: unknown[] | null;
}

/**
 * `GET /agents/{chainId}/{tokenId}`. Richer than a list row: it carries the
 * publisher-declared `tags` we classify on, the service endpoints we probe, and
 * 8004scan's own service-health breakdown.
 */
export interface ScanAgentDetail extends ScanAgent {
  creator_address: string | null;
  agent_type: string | null;
  agent_wallet: string | null;
  watch_count: number;
  tags: string[] | null;
  categories: string[] | null;
  services: Record<string, ScanService> | null;
  scores: {
    quality?: number;
    popularity?: number;
    activity?: number;
    wallet?: number;
    freshness?: number;
    metadata_completeness?: number;
    health_score?: number | null;
    breakdown?: {
      version?: string;
      algorithm?: string;
      dimensions?: Record<string, unknown>;
    } | null;
  } | null;
}

export interface ScanPage<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * A row from `GET /feedbacks`. Every feedback is an on-chain event, so
 * `transaction_hash` and `block_number` are the provenance anchor that lets the
 * UI link any displayed number back to the chain.
 */
export interface ScanFeedback {
  id: string;
  agent_id: string;
  feedback_id: string;
  chain_id: number;
  is_testnet: boolean;
  score: number | null;
  /** Raw value, scaled by `value_decimals`. Arrives as a decimal string. */
  value: string | null;
  value_decimals: number | null;
  comment: string | null;
  /** Usually a `data:application/json;base64,...` URI holding the attestation. */
  feedback_uri: string | null;
  transaction_hash: string | null;
  block_number: number | null;
  created_at?: string | null;
}
