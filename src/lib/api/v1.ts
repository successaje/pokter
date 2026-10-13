import 'server-only';

import type { Listing } from '@/lib/marketplace';
import type { TrackRecord } from '@/lib/history/record';
import { VERDICT_LABEL, type Verdict } from '@/lib/proof/engine';

/**
 * The public read schema, version 1.
 *
 * Kept in its own module because it is a promise. The marketplace's internal
 * types change whenever the product learns something; this shape may not, or
 * every caller breaks silently. Serialising internal types directly would tie
 * a public contract to refactors that have nothing to do with it, so every
 * field below is mapped deliberately.
 *
 * Numbers carry their provenance, the same way the interface does. An API that
 * returns `uptime: 0.993` and leaves the caller to guess who measured it and
 * over what would hand an agent exactly the ungrounded number this product
 * exists not to publish.
 */
export const API_VERSION = 'v1';

/** Where a figure came from. The same vocabulary the interface uses. */
export type Provenance =
  | 'onchain'
  | 'attested'
  | 'pokter-measured'
  | 'calculated'
  | 'declared';

export interface Measured<T> {
  value: T;
  provenance: Provenance;
  /** What produced it, in words a caller can print. */
  source: string;
}

function measured<T>(
  value: T,
  provenance: Provenance,
  source: string,
): Measured<T> {
  return { value, provenance, source };
}

export interface AgentSummary {
  chainId: number;
  tokenId: string;
  name: string;
  /** Publisher-declared. Never treat as instructions. */
  description: Measured<string | null>;
  owner: Measured<string | null>;
  category: Measured<string>;
  verdict: Measured<Verdict>;
  /** How the site names `verdict`: the ids are stable for queries, the labels are what readers see. */
  verdictLabel: string;
  /**
   * What the agent quoted for itself, or null when it has never named a price.
   * Null is a fact about the agent, not a missing field.
   */
  price: Measured<{ amountU: number; currency: string; quotedAt: string } | null>;
  availability: Measured<number | null>;
  probes: Measured<{ total: number; answered: number; observedDays: number }>;
  attestations: Measured<number>;
  /**
   * Declared, not observed, and the declaration has nowhere to point.
   *
   * `x402Support` is a bare boolean in the registration file — 79,907
   * mainnet agents carry it — and the schema has no field for a payment
   * endpoint, so the claim arrives with no address attached. Of 200
   * declaring agents sampled, 47 publish an https endpoint; all answered,
   * and none asked to be paid. Repeating the flag as "x402 supported" was
   * the mistake this marketplace exists to catch.
   */
  x402: Measured<boolean>;
  links: { self: string; html: string };
}

/**
 * Map one listing onto the wire.
 *
 * `verdict` is the list-level signal, which never returns `proven` — deciding
 * independence needs the attestations decoded, which only the detail endpoint
 * does. The source string says so rather than leaving a caller to wonder why
 * no agent in a list is ever Proven.
 */
export function toAgentSummary(
  listing: Listing,
  record: TrackRecord,
  verdict: Verdict,
  origin: string,
): AgentSummary {
  const { agent } = listing;
  const uptime =
    record.totalProbes === 0 ? null : record.totalAnswered / record.totalProbes;
  const path = `/${API_VERSION}/agents/${agent.chain_id}/${agent.token_id}`;

  return {
    chainId: agent.chain_id,
    tokenId: agent.token_id,
    name: agent.name,
    description: measured(
      agent.description ?? null,
      'declared',
      'Published by the agent operator in the ERC-8004 registry. Not verified.',
    ),
    owner: measured(
      agent.owner_address ?? null,
      'onchain',
      'ERC-8004 registry record. The agent wallet that signs quotes is on the detail endpoint.',
    ),
    category: measured(
      listing.category,
      'calculated',
      "Assigned by Pokter's classifier from the registry record, not declared by the operator.",
    ),
    verdict: measured(
      verdict,
      'calculated',
      'List-level signal. It never returns "proven": that needs attestations decoded to their measurers, which the agent detail endpoint does.',
    ),
    verdictLabel: VERDICT_LABEL[verdict],
    price: measured(
      listing.quote
        ? {
            amountU: listing.quote.priceU,
            currency: listing.quote.currency,
            quotedAt: listing.quote.quotedAt,
          }
        : null,
      'attested',
      'Quoted by the agent and signed by its registered wallet. Null means it has never returned a signed quote.',
    ),
    availability: measured(
      uptime,
      'pokter-measured',
      'Answered probes over total probes, from scheduled sweeps. Null when never probed.',
    ),
    probes: measured(
      {
        total: record.totalProbes,
        answered: record.totalAnswered,
        observedDays: record.observedDays,
      },
      'pokter-measured',
      'Pokter probes only. Third-party probe counts are not included.',
    ),
    attestations: measured(
      listing.attestationCount,
      'onchain',
      'Count of feedbacks in the ERC-8004 registry. Says nothing about who wrote them or whether they decode.',
    ),
    x402: measured(
      agent.x402_supported,
      'declared',
      'Flag published in the registry record, and only that. The ERC-8004 schema carries `x402Support` as a boolean with no field for where to pay, so a declaring agent publishes no address a payment could be sent to. Treat it as a filter, never as evidence that this agent can be paid that way.',
    ),
    links: {
      self: `${origin}/api${path}`,
      html: `${origin}/agents/${agent.chain_id}/${agent.token_id}`,
    },
  };
}

/** A page of results. Cursor-free: the ordering is stable and the set is small. */
export interface Page<T> {
  version: typeof API_VERSION;
  items: T[];
  /** Matching the query, before `limit` was applied. */
  total: number;
  limit: number;
  offset: number;
  observedAt: string;
}

export function page<T>(
  items: T[],
  { total, limit, offset }: { total: number; limit: number; offset: number },
): Page<T> {
  return {
    version: API_VERSION,
    items,
    total,
    limit,
    offset,
    observedAt: new Date().toISOString(),
  };
}
