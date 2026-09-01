import { formatMs, formatPercent } from '@/lib/ui/format';
import type { TrackRecord } from '@/lib/history/record';

/**
 * §20. Performance.
 *
 * The brief asks for return, drawdown, volatility and capital managed. None of
 * those are published by the registry and no measurer attests to them, so this
 * panel shows what *is* measured — availability and responsiveness — and names
 * the rest as unavailable rather than filling the space with a proxy that would
 * be read as performance.
 */
const UNAVAILABLE = [
  { label: 'Return', why: 'No measurer attests to realised P&L.' },
  { label: 'Max drawdown', why: 'Requires a position history nobody publishes.' },
  { label: 'Capital managed', why: 'Agent wallets are not linked to strategy balances.' },
  { label: 'Gas & slippage', why: 'Executions are not attributable to this agent on-chain.' },
];

export function PerformancePanel({ record }: { record: TrackRecord }) {
  const measured = [
    {
      label: 'Availability',
      value:
        record.totalProbes === 0
          ? '—'
          : formatPercent(record.totalAnswered / record.totalProbes),
      sub: `${record.totalAnswered}/${record.totalProbes} probes`,
    },
    {
      label: 'Median response',
      value: formatMs(
        [...record.windows].reverse().find((w) => w.medianMs !== null)?.medianMs ??
          null,
      ),
      sub: 'across successful probes',
    },
    {
      label: 'Observed for',
      value: record.days.length === 0 ? '—' : `${record.days.length}d`,
      sub: 'since Pokter first saw it',
    },
    {
      label: 'Longest outage',
      value: record.longestOutage ? `${record.longestOutage.probes}` : '0',
      sub: 'consecutive failed probes',
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium tracking-tight">Performance</h2>
        <p className="text-xs text-[color:var(--text-muted)]">
          What has actually been measured, and what nobody publishes.
        </p>
      </div>

      <dl className="grid grid-cols-2 divide-[color:var(--border)] rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] sm:grid-cols-4 sm:divide-x">
        {measured.map((metric) => (
          <div key={metric.label} className="flex flex-col gap-1 p-4">
            <dt className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
              {metric.label}
            </dt>
            <dd className="tabular text-xl leading-none">{metric.value}</dd>
            <dd className="text-[10px] text-[color:var(--text-faint)]">
              {metric.sub}
            </dd>
          </div>
        ))}
      </dl>

      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-4">
        <p className="text-[11px] font-medium text-[color:var(--text-secondary)]">
          Not enough verified data
        </p>
        <ul className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {UNAVAILABLE.map((item) => (
            <li key={item.label} className="text-[11px] leading-relaxed">
              <span className="text-[color:var(--text-muted)]">{item.label}</span>
              <span className="text-[color:var(--text-faint)]"> — {item.why}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[10px] leading-relaxed text-[color:var(--text-faint)]">
          Pokter does not estimate these from availability. An agent that answers
          every probe can still trade badly, and presenting uptime as though it
          were performance would be the fabrication this product argues against.
        </p>
      </div>
    </section>
  );
}
