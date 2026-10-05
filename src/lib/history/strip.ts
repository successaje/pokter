import type { TrackRecord } from './record';

/** One cell of the evidence strip: a calendar day, probed or not. */
export interface StripCell {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  probes: number;
  answered: number;
  /** 0..1, or null when nothing was asked that day. */
  ratio: number | null;
}

/**
 * The last `days` calendar days, ending today, each joined to what the
 * record holds for it.
 *
 * Fixed window rather than first-to-last probe on purpose: an agent that
 * stopped answering last week shows a run of empty cells at the right-hand
 * end, and a reader sees the silence where it is. `record.days` holds only
 * days that carried probes, so a day with no bucket comes back with a null
 * ratio for the caller to draw as absence rather than as fault.
 */
export function stripCells(record: TrackRecord, days: number, now: number = Date.now()): StripCell[] {
  const byDate = new Map(record.days.map((day) => [day.date, day]));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10);
    const bucket = byDate.get(date);
    return {
      date,
      probes: bucket?.probes ?? 0,
      answered: bucket?.answered ?? 0,
      ratio: bucket?.ratio ?? null,
    };
  });
}

/**
 * Days since the agent last answered a check, or null when it never has.
 *
 * A verdict is accumulated history; this is the recency the verdict does
 * not carry. An agent that answered everything for a month and then went
 * quiet still reads Reliable, and the one fact a buyer needs beside that
 * badge is how long ago the last answer was.
 */
export function daysSinceLastAnswer(record: TrackRecord, now: number = Date.now()): number | null {
  const last = [...record.days].reverse().find((day) => day.answered > 0);
  if (!last) return null;
  const then = Date.parse(`${last.date}T00:00:00Z`);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

/** Older than this, and the recency is said beside the verdict. */
export const STALE_AFTER_DAYS = 7;
