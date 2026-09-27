import { StatusState } from '@/components/ui/States';
import type { LiveReading } from '@/lib/proof/prober';

/**
 * First-party evidence: what happened when we called this agent just now.
 * This is the "watch it work" half of the marketplace, and it is the only
 * evidence on the page that is guaranteed to be fresh.
 */
export function LivePanel({ live }: { live: LiveReading }) {
  if (live.protocol === 'none') {
    return (
      <StatusState body="This agent publishes no reachable service endpoint, so there is nothing to watch. It cannot be probed, so Pokter will not recommend hiring it." />
    );
  }

  const answeredAll = live.answered === live.probes.length;
  const checkedAt = live.probes.at(-1)?.at;
  const checkedLabel = checkedAt
    ? new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: 'UTC',
      }).format(new Date(checkedAt))
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium">
            {live.answered}/{live.probes.length} probes answered
            <span className="ml-2 font-normal text-[color:var(--text-faint)]">
              over {live.protocol.toUpperCase()}
            </span>
          </span>
          <span className="tabular text-[11px] text-[color:var(--text-faint)]">
            {live.medianMs != null ? `median ${live.medianMs}ms` : 'no successful response'}
          </span>
          {checkedAt && checkedLabel && (
            <time
              dateTime={checkedAt}
              className="tabular text-[10px] text-[color:var(--text-faint)]"
            >
              Checked {checkedLabel} UTC
            </time>
          )}
        </div>
        <span
          className="tabular text-sm"
          style={{
            color: answeredAll ? 'var(--positive)' : live.answered === 0 ? 'var(--negative)' : 'var(--caution)',
          }}
        >
          {live.ratio === null ? '—' : `${(live.ratio * 100).toFixed(0)}%`}
        </span>
      </div>

      <ol className="flex flex-col gap-1.5">
        {live.probes.map((probe, index) => (
          <li
            key={`${probe.at}-${index}`}
            className="tabular flex items-baseline gap-3 text-[11px] text-[color:var(--text-muted)]"
          >
            <span
              aria-hidden
              className="mt-1 size-1.5 shrink-0 rounded-full"
              style={{ background: probe.ok ? 'var(--positive)' : 'var(--negative)' }}
            />
            <span className="shrink-0 text-[color:var(--text-faint)]">
              {probe.latencyMs != null ? `${probe.latencyMs}ms` : 'timeout'}
            </span>
            <time
              dateTime={probe.at}
              title={new Date(probe.at).toISOString()}
              className="shrink-0 text-[color:var(--text-faint)]"
            >
              {new Date(probe.at).toISOString().slice(11, 19)} UTC
            </time>
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">
              {probe.detail}
            </span>
          </li>
        ))}
      </ol>

      {live.capabilities.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-3.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--text-muted)]">
            Read-only capability discovery
          </span>
          <div className="flex flex-wrap gap-1.5">
            {live.capabilities.map((capability) => (
              <span
                key={capability}
                className="mono max-w-full break-all rounded-full border border-[color:var(--border)] px-2 py-1 text-[10px] text-[color:var(--text-secondary)]"
              >
                {capability}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="tabular break-all text-[11px] text-[color:var(--text-faint)]">
        {live.endpoint}
      </p>
    </div>
  );
}
