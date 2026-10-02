import { StatusState } from '@/components/ui/States';
import { ReliabilityChart } from '@/components/agent/ReliabilityChart';
import { plural, pluralise } from '@/lib/ui/plural';
import type { TrackRecord } from '@/lib/history/record';

function ratioColor(ratio: number | null): string {
  if (ratio === null) return 'var(--neutral)';
  if (ratio >= 0.99) return 'var(--positive)';
  if (ratio >= 0.5) return 'var(--caution)';
  return 'var(--negative)';
}

function formatDuration(days: number): string {
  if (days < 1 / 24) return 'under an hour';
  if (days < 1) return plural(Math.round(days * 24), 'hour');
  return `${days.toFixed(1)} ${pluralise(Number(days.toFixed(1)), 'day')}`;
}

/**
 * What repeated measurement has accumulated, as opposed to the single sample
 * taken at page load. The timeline is the honest part: it shows how little we
 * have watched as plainly as it shows how well the agent did.
 */
export function TrackRecordPanel({ record }: { record: TrackRecord }) {
  if (record.totalProbes === 0) {
    return (
      <StatusState body="Pokter has not yet swept this agent, so it has no accumulated record here. Only the live probe above speaks for it." />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/*
        The chart leads. The three windows below it are the same record
        summarised, and a reader who only looks at one thing should be looking
        at the shape of the observation rather than at three rounded numbers.
      */}
      <ReliabilityChart record={record} />

      <dl className="grid grid-cols-3 divide-x divide-[color:var(--border)] rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]">
        {record.windows.map((window) => (
          <div key={window.label} className="flex flex-col gap-1 p-3.5">
            <dt className="text-[11px] text-[color:var(--text-faint)]">
              {window.label}
            </dt>
            <dd
              className="tabular text-base"
              style={{ color: ratioColor(window.ratio) }}
            >
              {window.ratio === null ? '—' : `${(window.ratio * 100).toFixed(0)}%`}
            </dd>
            <dd className="tabular text-[11px] text-[color:var(--text-faint)]">
              {window.probes === 0
                ? 'no probes yet'
                : `${window.answered}/${window.probes} answered`}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-0.5" aria-hidden>
          {record.days.map((day) => (
            <div
              key={day.date}
              title={`${day.date}: ${day.answered}/${day.probes} answered`}
              className="h-8 flex-1 rounded-sm"
              style={{
                minWidth: '6px',
                background: ratioColor(day.ratio),
                opacity: day.ratio === null ? 0.25 : 0.35 + (day.ratio ?? 0) * 0.65,
              }}
            />
          ))}
        </div>
        <p className="tabular text-[11px] text-[color:var(--text-faint)]">
          {plural(record.days.length, 'day')} of coverage · {record.totalAnswered}/
          {record.totalProbes} probes answered · watched for{' '}
          {formatDuration(record.observedDays)}
        </p>
      </div>

      {record.longestOutage && (
        <p className="rounded-lg border border-[color:var(--negative)]/30 bg-[color:var(--negative)]/5 p-3 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
          Longest observed outage: {record.longestOutage.probes} consecutive failed
          {pluralise(record.longestOutage.probes, 'probe')}, from {record.longestOutage.from.slice(0, 16).replace('T', ' ')} to{' '}
          {record.longestOutage.to.slice(0, 16).replace('T', ' ')} UTC. Average
          uptime hides this; a position being watched does not.
        </p>
      )}
    </div>
  );
}
