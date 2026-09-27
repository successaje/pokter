import { formatCompact, formatCount } from '@/lib/ui/format';
import type { EcosystemStats } from '@/lib/marketplace';
import type { MarketplaceActivity } from '@/lib/discover/pulse';

interface MarketplacePulseProps {
  stats: EcosystemStats;
  listed: number;
  answering: number;
  attestations: number;
  activity: MarketplaceActivity;
}

export function MarketplacePulse({
  stats,
  listed,
  answering,
  attestations,
  activity,
}: MarketplacePulseProps) {
  const scale = [
    {
      value: stats.registered === null ? '—' : formatCompact(stats.registered),
      label: 'Registry identities',
      source: 'BNB Chain ERC-8004',
    },
    {
      value: formatCount(listed),
      label: 'Curated listings',
      source: 'Across 4 financial roles',
    },
    {
      value: formatCount(answering),
      label: 'Agents answering',
      source: 'Observed by Pokter',
    },
    {
      value: formatCount(stats.probesTaken),
      label: 'Endpoint probes',
      source: `${formatCount(stats.sweeps)} measured sweeps`,
    },
    {
      value: formatCount(attestations),
      label: 'Onchain attestations',
      source: 'Attached to these listings',
    },
  ];

  const activityRows = [
    { value: activity.hires, label: 'escrows funded' },
    { value: activity.deliveries, label: 'deliveries recorded' },
    { value: activity.settlements, label: 'settlements completed' },
    { value: activity.activeSessions, label: 'active permission sessions' },
  ].filter((item) => item.value > 0);

  return (
    <section
      aria-labelledby="marketplace-pulse-title"
      className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)]"
    >
      <div className="flex flex-col gap-2 border-b border-[color:var(--border)] px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--brand)]">
            Marketplace pulse
          </p>
          <h2 id="marketplace-pulse-title" className="mt-1 text-base font-semibold tracking-tight">
            The market, measured—not estimated.
          </h2>
        </div>
        <p className="max-w-md text-[10px] leading-relaxed text-[color:var(--text-faint)] sm:text-right">
          Registry scale comes from 8004scan. Verification and activity counts
          cover only records Pokter can independently read.
        </p>
      </div>

      <dl className="flex snap-x overflow-x-auto [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden">
        {scale.map((item) => (
          <div key={item.label} className="w-[68%] shrink-0 snap-start border-r border-[color:var(--border)] px-4 py-4 last:border-r-0">
            <dd className="tabular text-2xl font-semibold tracking-tight">{item.value}</dd>
            <dt className="mt-1 text-[11px] font-medium text-[color:var(--text-secondary)]">{item.label}</dt>
            <dd className="mt-0.5 truncate text-[9px] text-[color:var(--text-faint)]">{item.source}</dd>
          </div>
        ))}
      </dl>

      <dl className="hidden divide-x divide-y divide-[color:var(--border)] sm:grid sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
        {scale.map((item) => (
          <div key={item.label} className="min-w-0 px-5 py-4">
            <dd className="tabular text-2xl font-semibold tracking-tight">{item.value}</dd>
            <dt className="mt-1 text-[11px] font-medium text-[color:var(--text-secondary)]">{item.label}</dt>
            <dd className="mt-0.5 truncate text-[9px] text-[color:var(--text-faint)]">{item.source}</dd>
          </div>
        ))}
      </dl>

      {activityRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-4 py-3 sm:px-5">
          <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--positive)]">
            <span className="size-1.5 rounded-full bg-[color:var(--positive)]" aria-hidden />
            Recorded by Pokter
          </span>
          {activityRows.map((item) => (
            <span key={item.label} className="text-[11px] text-[color:var(--text-muted)]">
              <strong className="tabular font-semibold text-[color:var(--text)]">{item.value}</strong>{' '}
              {item.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
