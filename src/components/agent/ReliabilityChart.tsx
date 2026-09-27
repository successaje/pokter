import { plural } from '@/lib/ui/plural';
import type { TrackRecord } from '@/lib/history/record';

/**
 * Daily availability across the window we actually watched.
 *
 * Three states, and the distinction between the last two is the reason this
 * chart exists at all:
 *
 *   bar        — probed, and this share answered
 *   stub       — probed, and nothing answered
 *   empty slot — not probed that day
 *
 * A day nobody looked at is not a day the agent failed. `record.days` only
 * holds days that carried probes, so the gaps have to be reconstructed here;
 * drawing only the buckets we have would silently close them up and turn a
 * sparse record into a continuous one.
 *
 * The span runs first-observed to last-observed rather than a fixed 30 days,
 * because padding out to a month would show weeks of absence for an agent we
 * simply had not indexed yet — which reads as neglect rather than as youth.
 */
export function ReliabilityChart({ record }: { record: TrackRecord }) {
  const observed = record.days;

  /*
   * One bar is not a chart. Below two days the summary sentence above says
   * everything this would, with less ceremony.
   */
  if (observed.length < 2) return null;

  const byDate = new Map(observed.map((d) => [d.date, d]));
  const start = new Date(`${observed[0].date}T00:00:00Z`);
  const end = new Date(`${observed[observed.length - 1].date}T00:00:00Z`);

  const slots: { date: string; ratio: number | null; probes: number; answered: number }[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const bucket = byDate.get(date);
    slots.push({
      date,
      ratio: bucket?.ratio ?? null,
      probes: bucket?.probes ?? 0,
      answered: bucket?.answered ?? 0,
    });
  }

  const overall =
    record.totalProbes === 0
      ? null
      : record.totalAnswered / record.totalProbes;

  const describe = (slot: (typeof slots)[number]) =>
    slot.probes === 0
      ? `${slot.date}: not probed`
      : `${slot.date}: ${slot.answered} of ${plural(slot.probes, 'probe')} answered`;

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tabular text-2xl leading-none">
          {overall === null ? '—' : `${Math.round(overall * 100)}%`}
        </span>
        {/*
          "across 8 days watched" was the first thing written here and it was
          wrong in the exact way this chart exists to prevent: the span is
          eight days, the watching happened on three of them. The caption has
          to say which number is which, or it inflates the record the same way
          drawing only the populated buckets would.
        */}
        <span className="text-[12px] text-[color:var(--text-muted)]">
          answered · probed on {observed.length} of{' '}
          {plural(slots.length, 'day')}
        </span>
      </figcaption>

      {/*
        A fixed 24px slot width would run off a phone once the record is a
        month long, so the bars share the width instead and the chart stays
        inside its column at any span.
      */}
      <div
        className="flex h-24 items-end gap-[2px]"
        role="img"
        aria-label={`Daily availability from ${slots[0].date} to ${slots[slots.length - 1].date}.`}
      >
        {slots.map((slot) => {
          const height =
            slot.ratio === null ? 0 : Math.max(slot.ratio * 100, slot.probes > 0 ? 4 : 0);
          return (
            <div
              key={slot.date}
              className="group relative flex h-full min-w-0 flex-1 items-end"
              title={describe(slot)}
            >
              {/* The slot itself, so an unprobed day still occupies space. */}
              <div className="absolute inset-x-0 bottom-0 h-full rounded-[3px] bg-[color:var(--chart-track)]" />
              {slot.probes > 0 && (
                <div
                  className={
                    slot.ratio === 0
                      ? 'relative w-full rounded-[3px] bg-[color:var(--chart-bar-failed)]'
                      : 'relative w-full rounded-[3px] bg-[color:var(--chart-bar)]'
                  }
                  style={{ height: `${height}%` }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-[color:var(--text-faint)]">
        <span>{slots[0].date}</span>
        {/*
          A legend, because three states encoded only by colour would leave
          "failed" and "not probed" indistinguishable to anyone who cannot
          separate the hues — and those two are the pair that matters.
        */}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-[color:var(--chart-bar)]" aria-hidden />
            answered
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-[color:var(--chart-bar-failed)]" aria-hidden />
            none answered
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-[color:var(--chart-track)]" aria-hidden />
            not probed
          </span>
        </span>
        <span>{slots[slots.length - 1].date}</span>
      </div>

      {/* The same data as text, for anyone the bars do not serve. */}
      <table className="sr-only">
        <caption>Daily availability</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Probes</th>
            <th scope="col">Answered</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={slot.date}>
              <th scope="row">{slot.date}</th>
              <td>{slot.probes}</td>
              <td>{slot.probes === 0 ? 'not probed' : slot.answered}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
