import type { Listing } from '@/lib/marketplace';
import type { TrackRecord } from '@/lib/history/record';
import type { AgentEconomicHistory } from '@/lib/erc8183/economic-history';
import {
  FAILING_MAX_SCORE,
  HIREABLE_VERDICTS,
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
  /**
   * What became of jobs funded against this agent, where the index holds
   * any. Optional so a caller assembling agents without the job index still
   * satisfies the type; the card treats absent as "no jobs on record", which
   * is not the same as none completed.
   */
  history?: AgentEconomicHistory;
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
   * level can see: short of the probe or window minimum, Pokter has started
   * looking and has no business implying more than that. The rate is
   * deliberately not part of this test — a poorly performing agent that has
   * been probed hundreds of times has been examined, and saying otherwise
   * described our own coverage using the agent's score.
   */
  if (
    record.totalProbes < PROVEN_MIN_PROBES ||
    record.observedDays < PROVEN_MIN_WINDOW_DAYS
  ) {
    return 'observed';
  }

  /*
   * And the engine's quality split, which this level can see because it is
   * made of our own probes. Without it two thirds of the catalogue returned
   * `emerging` — an agent answering all 240 of its probes badged the same as
   * one missing a third of them, on cards that print both numbers directly
   * underneath. The cap above still holds: the best this can award is
   * `reliable`, and `proven` remains the detail page's to give.
   */
  return (rate ?? 0) >= PROVEN_MIN_SCORE ? 'reliable' : 'emerging';
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
    case 'price':
      return currentQuote(agent)?.priceU ?? null;
    default:
      return null;
  }
}

function currentQuote(agent: SearchableAgent) {
  const quote = agent.listing.quote;
  if (!quote) return null;
  if (quote.expiresAt && Date.parse(quote.expiresAt) <= Date.now()) return null;
  return quote;
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
        case 'responsive': {
          const recent = record.windows.find((window) => window.label === '24h');
          return Boolean(recent && recent.probes > 0 && (recent.ratio ?? 0) > 0);
        }
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
        case 'hireable':
          return offersDirectHire(agent);
        case 'escrow-only':
          // Pokter's current commission path creates one ERC-8183 job and no
          // standing wallet authority. This describes our hire path, not a
          // capability claimed by the registry publisher.
          return true;
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
        case 'price':
          return currentQuote(agent) !== null;
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
  /*
   * The same set the proof engine uses for the normal hire path. This read
   * `proven || emerging` and so withheld the button from every `observed`
   * agent, while the detail page behind the card offered it — the card and the
   * page disagreeing about the same agent, which is the fault this function's
   * own note above says it exists to prevent.
   */
  if (!HIREABLE_VERDICTS.has(verdictFor(entry))) return false;
  return entry.record.totalProbes > 0 && entry.record.totalAnswered > 0;
}
