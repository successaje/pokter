import type { Category } from '@/lib/agents/categories';
import type { Window } from '@/lib/history/record';
import type { BoardAgent } from './network';

/**
 * The window the answer rate is measured over, named on the column.
 *
 * A fixed window, not a lifetime rate. `TrackRecord` already publishes 24h,
 * 7d and 30d buckets, and one of them has to be chosen and printed, because
 * a cumulative rate silently compares agents watched for different lengths
 * of time: observed days across the agents that would qualify run from
 * about 4 to about 30 on mainnet and 2 to 20 on testnet. Ranking a four-day
 * agent against a thirty-day one on a lifetime rate is not an equivalent
 * check, and an equivalent check is the whole premise of this view.
 *
 * 30d is the longest bucket on offer and the one the catalogue already
 * loads history for, so it is the widest equivalent comparison available
 * without reading more than the page needs.
 */
export const RESPONSIVENESS_WINDOW_LABEL = '30d';
export const RESPONSIVENESS_WINDOW_DAYS = 30;

/**
 * Checks an agent needs inside the window before it is ranked at all.
 *
 * Applied to the checks inside the ranked 30-day window, not to a lifetime
 * total. A lifetime minimum would let an agent with 348 checks over its life
 * and two in the last month be ranked on those two.
 *
 * Why 50, with the measurement corrected. An earlier version of this comment
 * claimed an empty band between roughly 10 and 200 probes per agent. That was
 * wrong, and wrong in the flattering direction: re-counting the same data puts
 * 11 agents per chain inside it — mainnet at 82, 162, 164 five times and 190
 * three times; testnet at 80 twice, 84, 96, 196 twice, 198 and 200 four times.
 *
 * The real gap is below those, and it is cleaner than the one invented for it:
 * **every agent that does not clear the threshold has exactly nought checks**,
 * so the distribution steps from 0 to 82 on mainnet and 0 to 80 on testnet.
 * A threshold of 30 and one of 50 therefore do select the same agents — 61 of
 * 77 mainnet registrations, 46 of 94 on testnet — and 50 sits in empty space
 * rather than on a slope where moving it would reorder the board.
 *
 * What changes with the correction is the headroom: about 30 checks above the
 * threshold before the first real agent, not about 150. The number stands;
 * the comfort around it was overstated.
 *
 * All of that was measured on lifetime totals, and it transfers to the window
 * only because, as of 23 October 2026, no agent has been observed for 30 days
 * at all: the oldest mainnet records stand at 29.95, 29.94 and 29.93 observed
 * days, and testnet's oldest at 20.52, so every agent's whole history still
 * fits inside the window and the two measures coincide. That margin is hours,
 * not months.
 *
 * So this needs rechecking once histories run past the window, because the
 * justification above stops transferring the moment they do. At the observed
 * rate of roughly 11.6 checks a day the window should hold about 348 at
 * steady state, which would leave the gap open — but that is a prediction
 * from the current rate and not a measurement of the windowed distribution,
 * and it must not be read as one.
 *
 * Below the threshold an agent is listed, with its figures, under "not enough
 * checks". It is never shown as 0%: a rate out of three attempts is not a low
 * rate, it is no measurement.
 */
export const MIN_RESPONSIVENESS_CHECKS = 50;

/**
 * The single metric this view orders by.
 *
 * One entry, not because there is nothing else to measure, but because the
 * rule is one clearly named metric at a time and the header has to name
 * what produced the order. Median reply time is on the agent's own page and
 * is deliberately not blended in here.
 */
export type ResponsivenessMetric = 'answer-rate';

/**
 * What the column says, and what it refuses to say.
 *
 * `COLUMN` is the header. `MEANS` and `DOES_NOT_MEAN` are rendered beside
 * it, not buried in a methodology link, because the plausible misreading is
 * the flattering one: "answer rate" slides into "answer quality" in a
 * reader's head without any help from the page. It records whether a
 * scheduled call to the agent's endpoint got a well-formed protocol
 * response. It says nothing about whether the response was right, useful,
 * or even on the subject.
 */
export const ANSWER_RATE_COLUMN = `Answer rate (answered ÷ checks, last ${RESPONSIVENESS_WINDOW_DAYS} days)`;
export const ANSWER_RATE_MEANS =
  'The share of Pokter’s scheduled checks that the agent’s endpoint answered with a well-formed protocol response, measured by Pokter alone.';
export const ANSWER_RATE_DOES_NOT_MEAN =
  'It is not answer quality, not accuracy, not uptime and not reliability. It records that the agent replied, never that the reply was right.';

export interface ResponsivenessRow {
  agent: BoardAgent;
  /** The protocol the check speaks to this agent: `a2a`, `mcp`, or none observed. */
  protocol: string | null;
  /** Checks taken inside the window. The denominator, always shown. */
  checks: number;
  /** Of those, the ones answered. */
  answered: number;
  /** `answered / checks`, or null when the window holds no check at all. */
  answerRate: number | null;
  /** Whether the window holds enough checks for the row to be ranked. */
  ranked: boolean;
}

export interface CategoryResponsiveness {
  category: Category;
  /**
   * Rows with enough checks, ordered by answer rate.
   *
   * Only compared inside the category. Two categories' checks are the same
   * protocol handshake but reach different endpoints under different
   * conditions, and a cross-category table would invite a reader to treat
   * one category's typical rate as the standard for another.
   */
  ranked: ResponsivenessRow[];
  /** Rows the window holds too few checks for. Listed with their figures, never as 0%. */
  belowMinimum: ResponsivenessRow[];
}

export interface ResponsivenessCoverage {
  registryChainId: number;
  windowDays: number;
  minimumChecks: number;
  /** Listed agents on this registry chain. */
  listedAgents: number;
  /** Of those, the ones with at least one check inside the window. */
  agentsWithChecks: number;
  /** Of those, the ones with enough checks to be ranked. */
  agentsRanked: number;
  /** Checks taken inside the window across every listed agent on this chain. */
  checksInWindow: number;
  /** The newest check Pokter recorded for any of them. */
  lastCheckedAt: string | null;
  /** Categories whose registry reads all failed, so their rows are missing rather than empty. */
  unreadCategories: Category[];
}

export interface ResponsivenessBoard {
  registryChainId: number;
  metric: ResponsivenessMetric;
  categories: CategoryResponsiveness[];
  coverage: ResponsivenessCoverage;
}

/** The chosen window's bucket, or undefined when the record does not carry it. */
export function windowOf(windows: readonly Window[]): Window | undefined {
  return windows.find((window) => window.label === RESPONSIVENESS_WINDOW_LABEL);
}

export interface ResponsivenessInput {
  agent: BoardAgent;
  protocol: string | null;
  /** The agent's own track record windows, from `buildTrackRecord`. */
  windows: readonly Window[];
  /** The newest check recorded for this agent, from the same record. */
  lastSeen: string | null;
}

export function toResponsivenessRow(input: ResponsivenessInput): ResponsivenessRow {
  const window = windowOf(input.windows);
  const checks = window?.probes ?? 0;
  const answered = window?.answered ?? 0;
  return {
    agent: input.agent,
    protocol: input.protocol,
    checks,
    answered,
    /*
     * Null rather than zero when nothing was measured. `0 / 0` would print
     * as 0% and read as "answered nothing", when the fact is that Pokter
     * asked nothing. Every formatter in `lib/ui/format` renders null as an
     * em dash for this reason.
     */
    answerRate: checks === 0 ? null : answered / checks,
    ranked: checks >= MIN_RESPONSIVENESS_CHECKS,
  };
}

/**
 * Order by answer rate, then by the number of checks behind it.
 *
 * The tie-break is the same metric's own denominator, not a second metric:
 * of the agents that qualify, none sits at a perfect mainnet rate but four
 * do on testnet, so a tie is real and has to break on something. More
 * checks first means a longer clean record outranks a shorter one, which is
 * a statement about the strength of the same measurement rather than a new
 * one blended in. The header still explains the order.
 */
export function sortResponsivenessRows(rows: readonly ResponsivenessRow[]): ResponsivenessRow[] {
  return [...rows].sort(
    (a, b) =>
      (b.answerRate ?? -1) - (a.answerRate ?? -1) ||
      b.checks - a.checks ||
      a.agent.name.localeCompare(b.agent.name),
  );
}

export function buildResponsivenessBoard(
  {
    registryChainId,
    byCategory,
    unreadCategories,
  }: {
    registryChainId: number;
    /** Inputs grouped by the category the comparison is made inside. */
    byCategory: ReadonlyArray<{ category: Category; inputs: readonly ResponsivenessInput[] }>;
    /** Categories no registry read answered for. Their absence is not emptiness. */
    unreadCategories: readonly Category[];
  },
): ResponsivenessBoard {
  const categories: CategoryResponsiveness[] = byCategory.map(({ category, inputs }) => {
    const rows = inputs.map(toResponsivenessRow);
    return {
      category,
      ranked: sortResponsivenessRows(rows.filter((row) => row.ranked)),
      /*
       * Below the minimum, order by how close the row is to being
       * measurable rather than by its rate. Sorting these by rate would
       * publish a ranking of unranked agents, which is the thing the
       * minimum exists to prevent.
       */
      belowMinimum: rows
        .filter((row) => !row.ranked)
        .sort((a, b) => b.checks - a.checks || a.agent.name.localeCompare(b.agent.name)),
    };
  });

  const everyRow = categories.flatMap((entry) => [...entry.ranked, ...entry.belowMinimum]);
  const lastSeen = byCategory
    .flatMap(({ inputs }) => inputs.map((input) => input.lastSeen))
    .filter((seen): seen is string => seen !== null)
    .sort((a, b) => b.localeCompare(a))[0] ?? null;

  return {
    registryChainId,
    metric: 'answer-rate',
    categories,
    coverage: {
      registryChainId,
      windowDays: RESPONSIVENESS_WINDOW_DAYS,
      minimumChecks: MIN_RESPONSIVENESS_CHECKS,
      listedAgents: everyRow.length,
      agentsWithChecks: everyRow.filter((row) => row.checks > 0).length,
      agentsRanked: everyRow.filter((row) => row.ranked).length,
      checksInWindow: everyRow.reduce((sum, row) => sum + row.checks, 0),
      lastCheckedAt: lastSeen,
      unreadCategories: [...unreadCategories],
    },
  };
}
