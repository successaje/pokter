import type { Category } from '@/lib/agents/categories';

/**
 * The five dimensions of the Pokter Score, with the weights shown in the UI.
 * They sum to 100 so the breakdown reads as "24/25" rather than as an opaque
 * fraction.
 */
export type Dimension =
  | 'performance'
  | 'reliability'
  | 'evidence'
  | 'risk'
  | 'efficiency';

export const DIMENSION_WEIGHTS: Record<Dimension, number> = {
  performance: 25,
  reliability: 20,
  evidence: 20,
  risk: 20,
  efficiency: 15,
};

export const DIMENSION_LABELS: Record<Dimension, string> = {
  performance: 'Performance',
  reliability: 'Reliability',
  evidence: 'Evidence',
  risk: 'Risk',
  efficiency: 'Efficiency',
};

/**
 * One dimension's contribution.
 *
 * `earned` is null when the dimension could not be measured at all. That is a
 * different statement from earning zero, and the product is required to keep
 * them distinct: a zero says "we checked and it failed", a null says "nobody
 * has the data". Collapsing the two would be the fake-data failure mode this
 * codebase exists to avoid.
 */
export interface DimensionScore {
  dimension: Dimension;
  /** Points earned, out of `weight`. Null when unmeasurable. */
  earned: number | null;
  weight: number;
  /** Plain-language account of how this was derived, or why it could not be. */
  explanation: string;
  /** The inputs used, for the provenance popover. */
  inputs: { label: string; value: string }[];
}

export interface PokterScore {
  /**
   * 0..100, rescaled across the dimensions we could measure. Null when nothing
   * at all could be measured.
   */
  overall: number | null;
  dimensions: DimensionScore[];
  /** How many of the five dimensions carried real data. */
  measuredDimensions: number;
  totalDimensions: number;
  /** Share of total weight that was measurable, 0..1. */
  coverage: number;
  category: Category | 'unclassified';
  /**
   * Bumped whenever the formula changes, so a stored ranking stays reproducible
   * and two scores are never silently compared across formula versions.
   */
  version: string;
  calculatedAt: string;
}

export const SCORE_VERSION = '1.0.0';
