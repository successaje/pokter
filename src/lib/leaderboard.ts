import 'server-only';

import { CATEGORIES, type Category } from '@/lib/agents/categories';
import { getComparisons, listCategory, type Comparison } from '@/lib/marketplace';
import { mapWithConcurrency } from '@/lib/concurrency';

/**
 * §71 / §72. Rankings.
 *
 * Deliberately not one ordering. A single leaderboard implies a single question
 * ("which is best?") that nobody actually has — someone protecting a leveraged
 * position wants the agent that has never gone dark, while someone evaluating a
 * new strategy wants the one with the most independent scrutiny. The board
 * therefore publishes an overall order *and* the specific superlatives, each
 * derived from a stated metric.
 */

/**
 * How many agents each view resolves. Bounded by the registry rate limit, not
 * by taste: each agent costs two lookups on top of the category query, and the
 * anonymous tier allows thirty requests a minute. The overall board takes the
 * leading two per category so a cold load stays inside one window; SCAN_API_KEY
 * raises the ceiling to 3,000 and makes both numbers arbitrary.
 */
const PER_CATEGORY = 6;
const OVERALL_PER_CATEGORY = 2;

export interface Superlative {
  id: string;
  label: string;
  /** The metric this award is decided on, stated plainly. */
  basis: string;
  winner: Comparison | null;
  /** The winning value, formatted. */
  value: string;
  /** Why nobody won, when nobody did. */
  unavailable?: string;
}

function uptimeOf(entry: Comparison): number | null {
  if (entry.record.totalProbes === 0) return null;
  return entry.record.totalAnswered / entry.record.totalProbes;
}

function medianOf(entry: Comparison): number | null {
  return (
    [...entry.record.windows].reverse().find((w) => w.medianMs !== null)?.medianMs ??
    null
  );
}

/**
 * Pick a winner on one metric.
 *
 * Returns no winner when fewer than two candidates have the data, because
 * "best of one" is not a ranking — it is just the only measurement.
 */
function award(
  id: string,
  label: string,
  basis: string,
  entries: Comparison[],
  metric: (entry: Comparison) => number | null,
  format: (value: number, entry: Comparison) => string,
  { lowerWins = false }: { lowerWins?: boolean } = {},
): Superlative {
  const ranked = entries
    .map((entry) => ({ entry, value: metric(entry) }))
    .filter((r): r is { entry: Comparison; value: number } => r.value !== null)
    .sort((a, b) => (lowerWins ? a.value - b.value : b.value - a.value));

  if (ranked.length < 2) {
    return {
      id,
      label,
      basis,
      winner: null,
      value: '—',
      unavailable:
        ranked.length === 0
          ? 'No agent here has been measured on this yet.'
          : 'Only one agent has this measured, so there is nothing to rank against.',
    };
  }

  const [best] = ranked;
  return {
    id,
    label,
    basis,
    winner: best.entry,
    value: format(best.value, best.entry),
  };
}

export function superlativesFor(entries: Comparison[]): Superlative[] {
  return [
    award(
      'reliability',
      'Best reliability',
      'Highest share of probes answered',
      entries,
      uptimeOf,
      (value, entry) =>
        `${(value * 100).toFixed(1)}% of ${entry.record.totalProbes} probes`,
    ),
    award(
      'evidence',
      'Most scrutinised',
      'Most independent measurers',
      entries,
      (entry) => entry.proof.measurers.length,
      (value) => `${value} independent measurer${value === 1 ? '' : 's'}`,
    ),
    award(
      'record',
      'Longest track record',
      'Most days under observation',
      entries,
      (entry) => (entry.record.days.length === 0 ? null : entry.record.days.length),
      (value) => `${value} day${value === 1 ? '' : 's'} observed`,
    ),
    award(
      'responsive',
      'Most responsive',
      'Lowest median response time',
      entries,
      medianOf,
      (value) => `${value}ms median`,
      { lowerWins: true },
    ),
  ];
}

/** Rank by Pokter Score, then by how much of that score is backed by data. */
export function rankEntries(entries: Comparison[]): Comparison[] {
  return [...entries].sort((a, b) => {
    const scoreDiff = (b.score.overall ?? -1) - (a.score.overall ?? -1);
    if (scoreDiff !== 0) return scoreDiff;
    return b.score.measuredDimensions - a.score.measuredDimensions;
  });
}

export async function leaderboardFor(
  category: Category | 'overall',
): Promise<Comparison[]> {
  if (category !== 'overall') {
    const listings = await listCategory(category, { limit: PER_CATEGORY });
    return rankEntries(
      await getComparisons(
        listings.map((l) => `${l.agent.chain_id}:${l.agent.token_id}`),
      ),
    );
  }

  // Overall takes the leading few from each category rather than the union of
  // everything: the point is a cross-category board, not a bigger list, and
  // every extra agent is another rate-limited lookup.
  const perCategory = await mapWithConcurrency(CATEGORIES, 2, async ({ id }) => {
    const listings = await listCategory(id, { limit: OVERALL_PER_CATEGORY });
    return listings.map((l) => `${l.agent.chain_id}:${l.agent.token_id}`);
  });

  return rankEntries(await getComparisons(perCategory.flat()));
}
