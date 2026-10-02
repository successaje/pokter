import { plural } from '@/lib/ui/plural';
import { buildDaySlots, missedDays } from '@/lib/history/day-slots';
import type { TrackRecord } from '@/lib/history/record';

const DAY = { month: 'short', day: 'numeric', timeZone: 'UTC' } as const;

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', DAY);
}

/**
 * One cell per day of the observed span.
 *
 * This replaces a row of flex-1 bars whose fill was the day's answer rate
 * expressed as opacity, between 0.35 and 1. Opacity is close to unreadable
 * as a quantity — a 60% day and a 90% day are two slightly different greens
 * — and the whole strip was aria-hidden, so the record was invisible to
 * anyone not looking at it. Worse, it mapped `record.days` directly, which
 * closes the gaps: a sparse record drew as a solid run.
 *
 * Cells are categorical instead, which is what a reader actually wants from
 * a strip like this: did it answer that day, partly, not at all, or was
 * nobody looking. The counts underneath carry the precision.
 */
export function ProbeGrid({ record }: { record: TrackRecord }) {
  const slots = buildDaySlots(record);

  /*
   * Two days is the floor. One cell is not a timeline, and the sentence
   * above it already says everything a single day can.
   */
  if (slots.length < 2) return null;

  const missed = missedDays(slots);
  const unprobed = slots.filter((slot) => slot.probes === 0).length;

  const tone = (slot: (typeof slots)[number]) => {
    if (slot.probes === 0) return 'bg-[color:var(--border)]';
    if (slot.ratio === null || slot.ratio === 0)
      return 'bg-[color:var(--negative)]';
    if (slot.ratio < 1) return 'bg-[color:var(--caution)]';
    return 'bg-[color:var(--positive)]';
  };

  const describe = (slot: (typeof slots)[number]) =>
    slot.probes === 0
      ? `${slot.date}: not probed`
      : `${slot.date}: ${slot.answered} of ${plural(slot.probes, 'probe')} answered`;

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1" role="img" aria-label={
        `Daily answer record across ${plural(slots.length, 'day')}: ` +
        `${slots.length - missed.length - unprobed} fully answered, ` +
        `${missed.length} with a missed check, ${unprobed} not probed.`
      }>
        {slots.map((slot) => (
          <span
            key={slot.date}
            title={describe(slot)}
            className={`h-4 w-2.5 rounded-[2px] ${tone(slot)}`}
          />
        ))}
      </div>

      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[11px] text-[color:var(--text-faint)]">
        <span>{shortDate(slots[0].date)}</span>
        {/*
          The middle slot states what the colours cannot: which days failed
          and how bad the worst run was. A grid that shows a red cell and
          says nothing about it makes the reader count squares.
        */}
        <span className="tabular text-center text-[color:var(--text-muted)]">
          {missed.length === 0
            ? `Answered every check on all ${plural(slots.length - unprobed, 'probed day')}`
            : `${plural(missed.length, 'day')} with a missed check · worst on ${shortDate(
                missed.reduce((a, b) => ((a.ratio ?? 1) <= (b.ratio ?? 1) ? a : b)).date,
              )}`}
          {unprobed > 0 && ` · ${unprobed} not probed`}
        </span>
        <span>{shortDate(slots[slots.length - 1].date)}</span>
      </figcaption>
    </figure>
  );
}
