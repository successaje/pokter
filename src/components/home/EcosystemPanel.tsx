import { formatCount } from '@/lib/ui/format';
import { CountUp, type CountFormat } from '@/components/motion/CountUp';
import type { EcosystemStats } from '@/lib/marketplace';

/**
 * §14. Live ecosystem figures.
 *
 * Each figure is labelled with who counted it. The registry total comes from
 * 8004scan; everything else is Pokter's own measurement, and says so, because
 * "296K agents exist" and "we have verified 24" are very different claims and
 * the gap between them is the product's reason for existing.
 *
 * The figures interpolate on entry — the one place the eye should linger, and
 * the gap between the first number and the third is the argument.
 */
export function EcosystemPanel({ stats }: { stats: EcosystemStats }) {
  const figures: {
    value: number | null;
    format: CountFormat;
    label: string;
    source: string;
  }[] = [
    {
      value: stats.registered,
      format: 'compact',
      label: 'registered agents',
      source: 'ERC-8004 registry, via 8004scan',
    },
    {
      value: stats.categories,
      format: 'plain',
      label: 'financial categories',
      source: 'Marketplace scope',
    },
    {
      value: stats.agentsMonitored,
      format: 'count',
      label: 'agents monitored',
      source: 'Indexed by Pokter',
    },
    {
      value: stats.probesTaken,
      format: 'count',
      label: 'probes taken',
      source: `Measured by Pokter across ${formatCount(stats.sweeps)} sweep(s)`,
    },
  ];

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)]">
      <h2 className="border-b border-[color:var(--border-strong)] px-5 py-3 text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
        BNB agent economy
      </h2>

      <dl className="grid divide-y divide-[color:var(--border)] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {figures.map((figure) => (
          <div key={figure.label} className="flex flex-col gap-1.5 px-5 py-6">
            <dt className="tabular text-3xl font-medium leading-none tracking-tight sm:text-4xl">
              {figure.value === null ? (
                '—'
              ) : (
                <CountUp value={figure.value} format={figure.format} />
              )}
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
