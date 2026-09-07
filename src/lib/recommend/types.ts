import type { Category } from '@/lib/agents/categories';
import type { Listing } from '@/lib/marketplace';
import type { TrackRecord } from '@/lib/history/record';
import type { PokterScore } from '@/lib/score/types';

export type RiskTolerance = 'low' | 'medium' | 'high';

/** §52. What the user tells us. */
export interface Brief {
  objective: Category;
  /** In USD. Used for display and disclosure, not for filtering — see below. */
  capital: number;
  risk: RiskTolerance;
  /** Days. */
  horizon: number;
}

/** Why a candidate did not make the cut. */
export interface Rejection {
  listing: Listing;
  reason: string;
}

/** A candidate that passed filtering, with its fit assessment. */
export interface Match {
  listing: Listing;
  record: TrackRecord;
  score: PokterScore;
  /** 0..1. How well this agent fits *this brief*, distinct from its quality. */
  fit: number;
  /** Concrete, checkable reasons this was recommended. */
  reasons: string[];
  /** Honest downsides the user should weigh. */
  tradeoffs: string[];
}

export interface Recommendation {
  brief: Brief;
  /** Best match, or null when nothing cleared the bar. */
  recommended: Match | null;
  alternatives: Match[];
  rejected: Rejection[];
  /**
   * How many agents cleared every filter, which is not the same as how many
   * are displayed. `alternatives` is capped so the page stays readable, and
   * without this the surplus would vanish silently — neither recommended, nor
   * shown, nor ruled out.
   */
  matched: number;
  rejected_count?: never;
  /** Total candidates considered before filtering. */
  considered: number;
  /**
   * What this recommendation could not take into account. Surfaced in the UI
   * rather than hidden, because a recommendation that hides its blind spots is
   * worse than one that admits them.
   */
  limitations: string[];
}
