import type { RiskTolerance } from './types';

/**
 * The bars a candidate must clear to be recommended, per risk tolerance.
 *
 * Kept in their own module, free of server-only imports, so the methodology
 * page can display the values the engine actually uses. Documentation that
 * restates a threshold by hand drifts from the code the first time either
 * changes; this cannot.
 */
export const MIN_UPTIME: Record<RiskTolerance, number> = {
  low: 0.98,
  medium: 0.9,
  high: 0.7,
};

/** Minimum probes before an agent can be recommended rather than merely listed. */
export const MIN_PROBES: Record<RiskTolerance, number> = {
  low: 20,
  medium: 10,
  high: 4,
};
