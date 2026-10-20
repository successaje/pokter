/**
 * When saturation sightings are one episode and when they are two.
 *
 * Pure, and separate from the store for the reason the sweep schedule is:
 * the decisions are the part worth holding to tests, and a module that
 * imports `server-only` cannot be imported by one. The store below persists
 * what these functions decide and contributes no judgement of its own.
 */

export interface SaturationEpisode {
  /** When a check first saw saturation that was not a continuation. */
  startedAt: string;
  /** The last check that saw it: with `startedAt`, the duration. */
  lastSeenAt: string;
  /** How many checks saw it, so a flap reads differently from a sustained stall. */
  checks: number;
  /** The worst event-loop p99 seen, never overwritten by a milder later reading. */
  peakLagP99Ms: number | null;
  /** The worst count of upstream calls that hit their deadline. */
  peakTimedOut: number;
  /** Every distinct reason seen, since an episode can change character as it runs. */
  reasons: string[];
}

export interface SaturationSighting {
  at: string;
  lagP99Ms: number | null;
  timedOutRecently: number;
  reasons: string[];
}

/**
 * How long a quiet gap must be before the next sighting is a new episode.
 *
 * Checks normally arrive every fifteen seconds or so, but the point of an
 * episode is that the process is too busy to serve — and during the stall on
 * 20 October a check arrived 92 seconds after the last, which the detector
 * itself reported. A window tighter than that would have split one stall
 * into a dozen, each looking brief. Five minutes is wide enough to survive a
 * loop that has stopped answering, and narrow enough that two incidents an
 * hour apart stay two incidents.
 */
export const EPISODE_GRACE_MS = 5 * 60_000;

/** Whether a sighting belongs to the episode already open, or starts another. */
export function continuesEpisode(open: SaturationEpisode | null, sighting: SaturationSighting): boolean {
  if (open === null) return false;
  return Date.parse(sighting.at) - Date.parse(open.lastSeenAt) <= EPISODE_GRACE_MS;
}

/** The episode a sighting opens when nothing is open. */
export function openEpisode(sighting: SaturationSighting): SaturationEpisode {
  return {
    startedAt: sighting.at,
    lastSeenAt: sighting.at,
    checks: 1,
    peakLagP99Ms: sighting.lagP99Ms,
    peakTimedOut: sighting.timedOutRecently,
    reasons: [...new Set(sighting.reasons)],
  };
}

/**
 * The open episode, extended by a sighting.
 *
 * Peaks only ever climb. A stall that eases before it ends must not erase
 * how bad it got, and a null lag means "not measured this time" rather than
 * "recovered" — `readVitals` resets its histogram on every read, so a check
 * that arrives before samples accumulate legitimately reports nothing.
 */
export function extendEpisode(open: SaturationEpisode, sighting: SaturationSighting): SaturationEpisode {
  return {
    startedAt: open.startedAt,
    lastSeenAt: sighting.at,
    checks: open.checks + 1,
    peakLagP99Ms: sighting.lagP99Ms === null ? open.peakLagP99Ms : Math.max(open.peakLagP99Ms ?? 0, sighting.lagP99Ms),
    peakTimedOut: Math.max(open.peakTimedOut, sighting.timedOutRecently),
    reasons: [...new Set([...open.reasons, ...sighting.reasons])],
  };
}
