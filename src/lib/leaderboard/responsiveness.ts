import type { Category } from '@/lib/agents/categories';
import type { Window } from '@/lib/history/record';
import type { BoardAgent } from './network';

/**
 * The window the answer rate is measured over, named on the column.
 *
 * A fixed window, not a lifetime rate. `TrackRecord` publishes 24h, 7d and
 * 30d buckets, and one of them has to be chosen and printed, because a rate
 * whose period is not named cannot be checked against anything. 30d is the
 * longest bucket on offer and the one the catalogue already loads history
 * for, so it is the widest comparison available without reading more than
 * the page needs.
 *
 * What this window does not do is equalise that comparison, and an earlier
 * version of this comment claimed it did — that picking a fixed window kept
 * the board from ranking a four-day agent against a thirty-day one. It does
 * not, because the window is not the binding constraint: the catalogue loads
 * probes with `HISTORY_DAYS = 30` in `lib/marketplace.ts`, the same 30 days,
 * so the bucket spans the whole of what was read and truncates nothing out
 * of it. Two agents sit side by side under one window label with entirely
 * different amounts of measurement behind them. Measured on 23 October 2026
 * from `/api/v1/agents`, the span between an agent's first and last loaded
 * check ran 4.1688 to 29.9290 days over the 60 of 76 mainnet listings Pokter
 * holds any check for, and 0.1154 to 20.7035 days over 47 of 95 on testnet.
 *
 * Nor can that field support the comfortable reading of those figures, that
 * no agent has 30 days of history so nothing is being truncated. The span is
 * computed from a read bounded at 30 days, so it is arithmetically incapable
 * of reaching 30 whatever the agents' real ages are, and a measurement that
 * cannot come out otherwise is not evidence. The mainnet distribution says as
 * much: 40 of those 60 spans fall between 29.86 and 29.93 days, roughly one
 * sweep interval short of the cutoff, which is what a history running past
 * the edge of the read looks like from inside it.
 *
 * So each row discloses its own span instead — `formatObservedSpan` and
 * `observedSpanNote` — and the reader is told what the board cannot equalise.
 * Restricting the ranking to agents whose history covers the full window was
 * considered and rejected: it would empty the board, and a blank page is a
 * worse answer than a disclosed limit.
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
 * Those counts needed no transfer from a lifetime distribution to a windowed
 * one, which an earlier version of this comment thought they did. They were
 * read from `/api/v1/agents`, whose `probes.total` is `record.totalProbes`
 * over the same 30-day catalogue read, so they were already windowed counts.
 * There is no lifetime measure anywhere on this path to transfer from — see
 * `RESPONSIVENESS_WINDOW_DAYS` above, where the read bound is what makes the
 * window's own truncation unobservable.
 *
 * The gap does still need rechecking, because it is a fact about today's
 * distribution rather than a property of the threshold. At the observed rate
 * of roughly 11.8 checks a day the window holds about 350 at steady state,
 * which is where the busiest agents already are — 352 on mainnet, 302 on
 * testnet, measured 23 October 2026 — so the empty band below them closes as
 * the quieter agents fill in, not as histories outgrow the window.
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

/**
 * How much of the window a row's rate is actually made of.
 *
 * Said as a share of the window rather than as a bare duration, because the
 * bare duration is the part a reader cannot place: "2.4 days" sitting under a
 * column headed "last 30 days" reads as a detail about the agent, not as a
 * warning that the rate beside it covers a twelfth of the advertised period.
 * "over 2.4 of 30 days" cannot be read that way, and it sits directly under
 * "48 of 60 checks" as the same shape of statement.
 *
 * One decimal place, and deliberately not `formatDuration` from
 * `lib/ui/format`: that helper rounds to whole days, so it prints the
 * 29.9290-day mainnet spans as "30d" and a row whose entire purpose is to
 * show it has not covered 30 days would claim it had. That is the same defect
 * as the nought that rendered 349 of 350 checks as "100%" — a figure rounded
 * until it states something untrue.
 */
export function spanDecimal(observedDays: number): string {
  const days = Number.isFinite(observedDays) ? Math.max(0, observedDays) : 0;
  /*
   * Floored, not rounded, and that is the whole point of this helper.
   *
   * `toFixed(1)` rounds, so any span at or above 29.95 printed as "30.0" and
   * eight rows on the live mainnet board claimed "over 30.0 of 30 days" — a
   * row saying it covered the entire window, when the window IS the read
   * bound and therefore nothing can cover it. The comment above warned
   * against exactly this and the implementation did it anyway, because the
   * test picked 29.9290, the one span that happens to round down.
   *
   * Flooring can only understate coverage, which is the safe direction for a
   * figure whose job is to warn that a rate rests on less than it advertises.
   */
  return (Math.floor(days * 10) / 10).toFixed(1);
}

export function formatObservedSpan(observedDays: number): string {
  return `over ${spanDecimal(observedDays)} of ${RESPONSIVENESS_WINDOW_DAYS} days`;
}

/**
 * The limit on the order, stated beside the column that publishes it.
 *
 * Beside the column rather than in the methodology, for the same reason
 * `ANSWER_RATE_DOES_NOT_MEAN` is: the flattering misreading is the automatic
 * one. A reader who sees rows ordered under "last 30 days" assumes the rows
 * were measured over the same 30 days, and on this data they are not.
 *
 * Built from the coverage rather than written as a sentence, because a frozen
 * sentence is how the claim this replaces went stale — it asserted that no
 * agent had 30 days of history, which the read bound makes unobservable, and
 * it would have kept asserting it for as long as nobody re-measured. These
 * figures are whatever the live board holds.
 */
export function observedSpanNote(coverage: ResponsivenessCoverage): string {
  const bound =
    `Pokter loads the last ${coverage.windowDays} days of checks and no more, so a rate is measured ` +
    'over whatever part of that period it holds for the agent.';
  if (!coverage.rankedSpanDays) {
    return `${bound} No row is ranked here, so there is no spread to report.`;
  }
  const { shortest, longest } = coverage.rankedSpanDays;
  const spread =
    spanDecimal(shortest) === spanDecimal(longest)
      ? `Every ranked row covers ${spanDecimal(longest)} of the ${coverage.windowDays} days.`
      : `The ranked rows do not hold the same part: their spans run from ${spanDecimal(shortest)} to ` +
        `${spanDecimal(longest)} of the ${coverage.windowDays} days, shown on each row.`;
  return (
    `${bound} ${spread} A span near ${coverage.windowDays} reaches the edge of what Pokter loads and may ` +
    'have older checks behind it that this board cannot see; a short span is the whole of what Pokter ' +
    'holds, not a cut-down version of something longer. Short spans are ranked anyway, and labelled, ' +
    'because dropping them would publish an empty board in place of a disclosed limit.'
  );
}

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
  /**
   * Days between the agent's first and last loaded check — how long Pokter
   * has actually been checking it, as far as this read can see.
   *
   * Carried onto the row rather than derived on the page, because the rate
   * beside it is meaningless without it: the column names 30 days and this
   * says how much of those 30 the rate is made of. Taken straight from
   * `TrackRecord.observedDays`, never recomputed here.
   */
  observedDays: number;
  /** The oldest loaded check, or null when there is none. Bounded by the read. */
  firstSeen: string | null;
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
  /**
   * The shortest and longest observed span among the ranked rows, in days.
   * Null when nothing is ranked.
   *
   * Ranked rows only. The spread is quoted beside the column as the limit on
   * the order the board publishes, and an unranked row is not in that order,
   * so letting its span widen the figure would overstate the limit on a
   * comparison it never entered.
   */
  rankedSpanDays: { shortest: number; longest: number } | null;
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
  /** The oldest, from the same record. */
  firstSeen: string | null;
  /** `TrackRecord.observedDays` as the record already computed it. */
  observedDays: number;
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
    /*
     * The span is disclosed, never a gate. Ranking only agents whose history
     * covers the whole window would empty this board — on 23 October 2026 no
     * loaded span reached 30 days on either chain, and the read bound means
     * none can — and a blank page is a worse answer than a disclosed limit.
     */
    ranked: checks >= MIN_RESPONSIVENESS_CHECKS,
    observedDays: input.observedDays,
    firstSeen: input.firstSeen,
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

  /*
   * Taken from the ranked rows across every category, because the order the
   * note qualifies is published per category but the limit on it is the same
   * read for all of them. Unranked rows are excluded: see `rankedSpanDays`.
   */
  const rankedSpans = categories.flatMap((entry) => entry.ranked.map((row) => row.observedDays));

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
      rankedSpanDays:
        rankedSpans.length === 0
          ? null
          : { shortest: Math.min(...rankedSpans), longest: Math.max(...rankedSpans) },
    },
  };
}
