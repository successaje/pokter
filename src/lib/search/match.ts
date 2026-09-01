import type { Listing } from '@/lib/marketplace';
import type { TrackRecord } from '@/lib/history/record';
import { categoryFromTag, type ParsedQuery, type Qualifier } from './query';

/** A listing plus what Pokter has measured about it. */
export interface SearchableAgent {
  listing: Listing;
  record: TrackRecord;
}

function uptime(record: TrackRecord): number | null {
  if (record.totalProbes === 0) return null;
  return record.totalAnswered / record.totalProbes;
}

/**
 * List-level evidence state.
 *
 * Coarser than the detail page's verdict, which needs per-agent attestation
 * lookups. It is honest about the two things it can know cheaply: whether any
 * on-chain attestation exists, and whether our own probes succeeded.
 */
function verdictFor({ listing, record }: SearchableAgent): string {
  const rate = uptime(record);

  if (rate !== null && rate === 0) return 'failing';
  if (listing.attestationCount === 0 && record.totalProbes === 0) return 'unproven';
  if (listing.attestationCount > 0 && record.totalProbes >= 10 && (rate ?? 0) >= 0.9) {
    return 'proven';
  }
  return 'emerging';
}

function numericField(agent: SearchableAgent, field: string): number | null {
  switch (field) {
    case 'attestations':
      return agent.listing.attestationCount;
    case 'probes':
      return agent.record.totalProbes;
    case 'days':
      return agent.record.days.length;
    case 'measurers':
      // Cheaply knowable: an on-chain attestation implies a third party, and
      // our own probes imply us.
      return (
        (agent.listing.attestationCount > 0 ? 1 : 0) +
        (agent.record.totalProbes > 0 ? 1 : 0)
      );
    case 'score': {
      const rate = uptime(agent.record);
      return rate === null ? null : Math.round(rate * 100);
    }
    default:
      return null;
  }
}

function compare(value: number, op: string, target: number): boolean {
  switch (op) {
    case '>':
      return value > target;
    case '<':
      return value < target;
    case '>=':
      return value >= target;
    case '<=':
      return value <= target;
    default:
      return value === target;
  }
}

function matchesQualifier(agent: SearchableAgent, q: Qualifier): boolean {
  const { listing, record } = agent;

  switch (q.kind) {
    case 'text': {
      const haystack =
        `${listing.agent.name} ${listing.agent.description ?? ''}`.toLowerCase();
      return haystack.includes(q.value);
    }

    case 'tag': {
      const category = categoryFromTag(q.value);
      return category !== null && listing.category === category;
    }

    case 'is': {
      switch (q.value) {
        case 'proven':
        case 'emerging':
        case 'unproven':
        case 'failing':
          return verdictFor(agent) === q.value;
        case 'live':
          return (uptime(record) ?? 0) > 0;
        case 'offline':
          return record.totalProbes > 0 && uptime(record) === 0;
        case 'measured':
          return record.totalProbes > 0;
        case 'unmeasured':
          return record.totalProbes === 0;
        case 'testnet':
          return listing.agent.chain_id === 97;
        case 'mainnet':
          return listing.agent.chain_id === 56;
        default:
          return false;
      }
    }

    case 'has': {
      const value = numericField(agent, q.field);
      // A missing measurement never satisfies a threshold. "More than 10
      // probes" is false for an agent nobody has probed, not unknown-therefore-
      // included.
      return value !== null && compare(value, q.op, q.value);
    }

    case 'has-flag': {
      switch (q.field) {
        case 'endpoint':
          return (listing.agent.supported_protocols ?? []).length > 0;
        case 'description':
          return Boolean(listing.agent.description?.trim());
        case 'attestations':
          return listing.attestationCount > 0;
        case 'record':
          return record.totalProbes > 0;
        default:
          return false;
      }
    }
  }
}

/** All qualifiers must match. Unknown terms are ignored here and surfaced in the UI. */
export function matchesQuery(agent: SearchableAgent, query: ParsedQuery): boolean {
  return query.qualifiers.every((q) => matchesQualifier(agent, q));
}

export { verdictFor };
