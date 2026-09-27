import { pluralise } from '@/lib/ui/plural';
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
      value: stats.agentsMonitored,
      format: 'count',
      label: 'called by Pokter',
      source: `Across ${stats.categories} financial categories`,
    },
    {
      value: stats.agentsAnswering,
      format: 'count',
      label: 'answered when called',
      source: 'Measured, not self-reported',
    },
    {
      value: stats.probesTaken,
      format: 'count',
      label: 'probes taken',
      source: `Measured by Pokter across ${formatCount(stats.sweeps)} ${pluralise(stats.sweeps, 'sweep')}`,
    },
  ];

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)]">
      {/*
        The panel was already built around this argument — the original note
        here said the gap between the first figure and the third is the point
        — but the figures never made it out loud. "74 agents monitored" beside
        a registry of hundreds of thousands reads as thin coverage, an apology
        for how little we have indexed.
        
        It is the opposite. A registry entry is a claim that something exists;
        most of those claims go unanswered when the address is actually
        called. Naming the two figures "called" and "answered" turns the gap
        from an embarrassment into the finding, and the line below says it
        plainly rather than leaving it to be inferred from a subtitle.

        The claim stays scoped to what Pokter has actually done. It is not a
        census of the registry — it is a census of the agents we called, which
        is the only one we are entitled to make.
      */}
      <div className="flex flex-col gap-1 border-b border-[color:var(--border-strong)] px-5 py-3">
        <h2 className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
          BNB agent economy
        </h2>
        <p className="text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
          A registry entry is a claim that an agent exists. Pokter calls the
          address to find out, and most of the registry has never answered.
        </p>
      </div>

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
