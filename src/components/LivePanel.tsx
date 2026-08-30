import type { LiveReading } from '@/lib/proof/prober';

/**
 * First-party evidence: what happened when we called this agent just now.
 * This is the "watch it work" half of the marketplace, and it is the only
 * evidence on the page that is guaranteed to be fresh.
 */
export function LivePanel({ live }: { live: LiveReading }) {
  if (live.protocol === 'none') {
    return (
      <p className="rounded-lg border border-dashed border-[color:var(--border)] p-5 text-xs leading-relaxed text-[color:var(--muted-dim)]">
        This agent publishes no reachable service endpoint, so there is nothing to
        watch. It cannot be probed, and it cannot be hired here.
      </p>
    );
  }

  const answeredAll = live.answered === live.probes.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium">
            {live.answered}/{live.probes.length} probes answered
            <span className="ml-2 font-normal text-[color:var(--muted-dim)]">
              over {live.protocol.toUpperCase()}
            </span>
          </span>
          <span className="tabular text-[11px] text-[color:var(--muted-dim)]">
            {live.medianMs != null ? `median ${live.medianMs}ms` : 'no successful response'}
          </span>
        </div>
        <span
          className="tabular text-sm"
          style={{
            color: answeredAll ? 'var(--proven)' : live.answered === 0 ? 'var(--failing)' : 'var(--emerging)',
          }}
        >
          {live.ratio === null ? '—' : `${(live.ratio * 100).toFixed(0)}%`}
        </span>
      </div>

      <ol className="flex flex-col gap-1.5">
        {live.probes.map((probe, index) => (
          <li
            key={`${probe.at}-${index}`}
            className="tabular flex items-baseline gap-3 text-[11px] text-[color:var(--muted)]"
          >
            <span
              aria-hidden
              className="mt-1 size-1.5 shrink-0 rounded-full"
              style={{ background: probe.ok ? 'var(--proven)' : 'var(--failing)' }}
            />
            <span className="shrink-0 text-[color:var(--muted-dim)]">
              {probe.latencyMs != null ? `${probe.latencyMs}ms` : 'timeout'}
            </span>
            <span>{probe.detail}</span>
          </li>
        ))}
      </ol>

      <p className="tabular break-all text-[11px] text-[color:var(--muted-dim)]">
        {live.endpoint}
      </p>
    </div>
  );
}
