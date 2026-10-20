/**
 * When a watched Venus position is worth an email. Pure, so the alert
 * policy is tested without a chain, a clock or a mail provider.
 *
 * Levels, worst last:
 *   no-debt       nothing borrowed, so nothing to liquidate
 *   safe          at or above the person's threshold
 *   below         under their threshold, still above the danger line
 *   danger        under 1.1: a small price move from liquidation
 *   liquidatable  under 1: Venus can liquidate it now
 */
export type Level = 'no-debt' | 'safe' | 'below' | 'danger' | 'liquidatable';

const RANK: Record<Level, number> = { 'no-debt': 0, safe: 1, below: 2, danger: 3, liquidatable: 4 };
export const DANGER_LINE = 1.1;
/** A position has to clear the threshold by this much to count as safe again, so a value hovering on the line does not email every sweep. */
export const RECOVERY_MARGIN = 0.05;
/** While in danger or liquidatable, the reminder repeats at most this often. */
export const REPEAT_MS = 12 * 3_600_000;
/** Reads failing for this long earn one "we cannot see your position" email. */
export const STALE_AFTER_MS = 2 * 3_600_000;

export function levelOf(healthFactor: number | null, threshold: number, previous: Level | null = null): Level {
  if (healthFactor === null) return 'no-debt';
  if (healthFactor < 1) return 'liquidatable';
  if (healthFactor < DANGER_LINE) return 'danger';
  if (healthFactor < threshold) return 'below';
  // Hysteresis: once under the line, it is safe again only with some room.
  if (previous && RANK[previous] >= RANK.below && healthFactor < threshold + RECOVERY_MARGIN) return 'below';
  return 'safe';
}

export type Alert = 'worse' | 'still-danger' | 'recovered' | null;

/**
 * The email this reading calls for, if any.
 *
 * Worse than before: always, including the first reading when it is
 * already under the threshold (that is what the person asked to know).
 * Still in danger or liquidatable: again after REPEAT_MS. Back to safe from
 * under the line: once. A first reading that is safe, or no debt, is a
 * silent baseline.
 */
export function alertFor(input: { previous: Level | null; next: Level; lastAlertAtMs: number | null; nowMs: number }): Alert {
  const { previous, next } = input;
  if (previous === null) return RANK[next] >= RANK.below ? 'worse' : null;
  if (RANK[next] > RANK[previous] && RANK[next] >= RANK.below) return 'worse';
  if (RANK[next] >= RANK.danger && RANK[next] === RANK[previous]) {
    return input.lastAlertAtMs === null || input.nowMs - input.lastAlertAtMs >= REPEAT_MS ? 'still-danger' : null;
  }
  if (next === 'safe' && RANK[previous] >= RANK.below) return 'recovered';
  return null;
}

/** Whether to send the one "Pokter cannot read this position" email. */
export function staleDue(input: { lastOkAtMs: number | null; createdAtMs: number; nowMs: number; staleSent: boolean }): boolean {
  if (input.staleSent) return false;
  return input.nowMs - (input.lastOkAtMs ?? input.createdAtMs) >= STALE_AFTER_MS;
}

/** How far all collateral can fall together before liquidation, as a fraction (0.256 = 25.6%). Null with no debt. */
export function dropToLiquidation(healthFactor: number | null): number | null {
  if (healthFactor === null) return null;
  return healthFactor <= 1 ? 0 : 1 - 1 / healthFactor;
}

/** Thresholds offered, and the bounds a custom one must sit in. */
export const THRESHOLDS = [1.5, 1.3, 1.2] as const;
export const THRESHOLD_MIN = 1.1;
export const THRESHOLD_MAX = 3;
