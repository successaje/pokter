import { formatCompact, formatCount } from '@/lib/ui/format';
import type { EcosystemStats } from '@/lib/marketplace';

/**
 * §14. Live ecosystem figures.
 *
 * Each figure is labelled with who counted it. The registry total comes from
 * 8004scan; everything else is Pokter's own measurement, and says so, because
 * "200,000 agents exist" and "we have verified 20" are very different claims
 * and the gap between them is the product's entire reason for existing.
 */
export function EcosystemPanel({ stats }: { stats: EcosystemStats }) {
  const figures: { value: string; label: string; source: string }[] = [
    {
      value: stats.registered === null ? '—' : formatCompact(stats.registered),
      label: 'registered agents',
      source: 'ERC-8004 registry, via 8004scan',
    },
    {
      value: String(stats.categories),
      label: 'financial categories',
      source: 'Marketplace scope',
    },
    {
      value: formatCount(stats.agentsMonitored),
      label: 'agents monitored',
      source: 'Indexed by Pokter',
    },
    {
      value: formatCount(stats.probesTaken),
      label: 'probes taken',
      source: `Measured by Pokter across ${formatCount(stats.sweeps)} sweep(s)`,
    },
  ];

  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]">
      <h2 className="border-b border-[color:var(--border)] px-5 py-3 text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
        BNB agent economy
      </h2>

      <dl className="grid divide-y divide-[color:var(--border)] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {figures.map((figure) => (
          <div key={figure.label} className="flex flex-col gap-1 px-5 py-4">
            <dt className="tabular text-2xl font-medium leading-none">
              {figure.value}
            </dt>
            <dd className="text-xs text-[color:var(--text-secondary)]">
              {figure.label}
            </dd>
            <dd className="text-[10px] leading-relaxed text-[color:var(--text-faint)]">
              {figure.source}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
