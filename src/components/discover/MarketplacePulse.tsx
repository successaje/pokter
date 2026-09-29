import { formatCompact, formatCount } from '@/lib/ui/format';
import { pluralise } from '@/lib/ui/plural';
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

  /*
   * Pluralised on the noun rather than written plural, because these counts
   * are genuinely small right now — one funded escrow reads "1 escrows
   * funded" otherwise, and a band arguing that the numbers are measured
   * rather than estimated cannot afford to look automatically generated.
   */
  /*
   * The lifecycle is shown whole, including the stages sitting at zero.
   *
   * This list was filtered to non-zero values, which meant a marketplace with
   * eight funded escrows and no deliveries displayed "8 escrows funded" and
   * nothing else — the flattering half of its own funnel. A product that
   * reports unmeasured dimensions as unmeasured everywhere else does not get
   * to hide the stage where its own numbers stop.
   *
   * The permission-session count is gone rather than fixed. It counted grants
   * with no revocation on record, which today means historical testnet
   * sessions, and printing them as current activity contradicted the
   * transparency section's statement that Pokter creates no new delegated
   * sessions. Two pages of the same product disagreed about whether anything
   * holds delegated authority.
   */
  const activityRows = [
    { value: activity.hires, noun: 'escrow', verb: 'funded' },
    { value: activity.deliveries, noun: 'delivery', plural: 'deliveries', verb: 'recorded' },
    { value: activity.settlements, noun: 'settlement', verb: 'completed' },
  ]
    .map((item) => ({
      value: item.value,
      label: `${pluralise(item.value, item.noun, item.plural)}${
        item.verb ? ` ${item.verb}` : ''
      }`,
    }));

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
