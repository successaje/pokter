import type { TrackRecord } from './record';

/** One calendar day in the observed span, probed or not. */
export interface DaySlot {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  probes: number;
  answered: number;
  /** 0..1, or null when nothing was probed that day. */
  ratio: number | null;
}

/**
 * Every day between the first and last probe, including the empty ones.
 *
 * `record.days` holds only days that carried probes. Rendering that array
 * directly packs a sparse record into a solid run: an agent probed on the
 * 1st, the 5th and the 20th draws three adjacent cells and reads as three
 * consecutive days of coverage. The reliability chart already rebuilt the
 * span to avoid exactly that; the strip beside it did not, so the same
 * record told two different stories on one page.
 *
 * A day nobody looked at is not a day the agent failed, so empty days come
 * back with `probes: 0` and a null ratio for the caller to draw as absence
 * rather than as fault.
 *
 * The span runs first-observed to last-observed rather than a fixed window,
 * because padding to 30 days shows weeks of nothing for an agent that was
 * only indexed last week — which reads as neglect rather than as youth.
 */
export function buildDaySlots(record: TrackRecord): DaySlot[] {
  const observed = record.days;
  if (observed.length === 0) return [];

  const byDate = new Map(observed.map((day) => [day.date, day]));
  const start = Date.parse(`${observed[0].date}T00:00:00Z`);
  const end = Date.parse(`${observed[observed.length - 1].date}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];

  const slots: DaySlot[] = [];
  for (let t = start; t <= end; t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const bucket = byDate.get(date);
    slots.push({
      date,
      probes: bucket?.probes ?? 0,
      answered: bucket?.answered ?? 0,
      ratio: bucket?.ratio ?? null,
    });
  }
  return slots;
}

/** Days that were probed and did not answer everything. */
export function missedDays(slots: DaySlot[]): DaySlot[] {
  return slots.filter((slot) => slot.probes > 0 && (slot.ratio ?? 1) < 1);
}
