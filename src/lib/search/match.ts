import type { Listing } from '@/lib/marketplace';
import type { TrackRecord } from '@/lib/history/record';
import {
  FAILING_MAX_SCORE,
  PROVEN_MIN_PROBES,
  PROVEN_MIN_SCORE,
  PROVEN_MIN_WINDOW_DAYS,
  type Verdict,
} from '@/lib/proof/engine';
import {
  categoryFromTag,
  VERDICTS,
  type ParsedQuery,
  type Qualifier,
} from './query';

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
export function verdictFor({ listing, record }: SearchableAgent): Verdict {
  const rate = uptime(record);

  /*
   * Failing at the engine's bar, not at zero.
   *
   * This used to call an agent failing only when it answered nothing at all,
   * while `summariseProof` fails anything under FAILING_MAX_SCORE. An agent
   * answering three probes in ten sat above the line here and below it there,
   * so the card and the page behind it disagreed about the same agent on the
   * same visit — the exact contradiction the note below was written to end.
   */
  if (rate !== null && rate < FAILING_MAX_SCORE) return 'failing';
  if (listing.attestationCount === 0 && record.totalProbes === 0) return 'unproven';

  /*
   * This never returns `proven`, and cannot.
   *
   * Proven means independent measurers agree, with Pokter excluded from that
   * count. Establishing it requires decoding each attestation to the measurer
   * behind it, which is what `summariseProof` does on the detail page and what
   * this deliberately cheap, list-level signal does not do. All it has is
   * `attestationCount`, a registry tally that says how many feedbacks exist
   * and nothing about who wrote them or whether any of them decode.
   *
   * It used to award `proven` for one attestation of any kind plus ten of our
   * own probes at 90% uptime. That badged twenty-one agents Proven on the
   * marketplace while the proof engine held that none were — so a card said
   * Proven and the page behind it said the opposite, about the same agent, on
   * the same visit.
   *
   * Capping at `emerging` is the conservative direction: this signal can now
   * understate an agent's standing but never overstate it, and the detail page
   * remains the only place the top tier is awarded, because it is the only
   * place independence is actually checked.
   *
   * Below `emerging` it makes the engine's other split, on the parts this
   * level can see: short of the probe, window or rate minimum, Pokter has
   * started looking and has no business implying more than that.
   */
  if (
    record.totalProbes < PROVEN_MIN_PROBES ||
    record.observedDays < PROVEN_MIN_WINDOW_DAYS ||
    (rate ?? 0) < PROVEN_MIN_SCORE
  ) {
    return 'observed';
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
      /*
       * Independent measurers only. This used to add one for our own probes,
       * so `has:measurers>1` matched any agent carrying a single attestation
       * that Pokter had also probed — counting ourselves toward the
       * independence the filter exists to test.
       *
       * At this level an attestation implies at most one third party, because
       * the registry tally does not say who wrote them. So the value is 0 or
       * 1, and `has:measurers>1` correctly matches nothing — which is the
       * truth today regardless.
       */
      return agent.listing.attestationCount > 0 ? 1 : 0;
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
      /*
       * Asked of the vocabulary rather than a list repeated here. This switch
       * enumerated the verdicts by hand, so adding `observed` to VERDICTS and
       * to the filter shelf left `is:observed` matching nothing at all: the
       * chip was offered, the badge was rendered, and the filter silently
       * returned an empty set.
       */
      if ((VERDICTS as string[]).includes(q.value)) {
        return verdictFor(agent) === q.value;
      }
      switch (q.value) {
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

/**
 * Whether a listing may offer Hire directly, without a detour through the
 * detail page.
 *
 * One definition, used by the discover rows, the marketplace cards and the
 * detail page, so the three cannot disagree about who is hireable. A button
 * that leads straight to a refusal is worse than no button, so this is
 * deliberately conservative.
 *
 * It reads the accumulated record rather than probing live: a list view would
 * otherwise cost one outbound request per card. The hire page still runs its
 * own live check and offers alternatives when that fails, so the worst case
 * is a redirect rather than a dead end.
 */
export function offersDirectHire(entry: SearchableAgent): boolean {
  const verdict = verdictFor(entry);
  if (verdict !== 'proven' && verdict !== 'emerging') return false;
  return entry.record.totalProbes > 0 && entry.record.totalAnswered > 0;
}
