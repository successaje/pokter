import type { Metadata } from 'next';
import Link from 'next/link';

import { supplyCensus } from '@/lib/census/supply';
import { formatCompact, formatCount, formatPercent } from '@/lib/ui/format';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { plural } from '@/lib/ui/plural';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Liveness census',
  description:
    'How far the ERC-8004 registry on BNB Chain gets from a claim that an agent exists to an agent that answers, quotes a price and has been independently checked.',
};

/**
 * §63. What survives being checked.
 *
 * Deliberately not a chart. The values span five orders of magnitude, so a
 * linear bar would erase every step after the first and a log bar would invite
 * a reader to compare lengths that mean nothing to each other. Worse, the
 * narrowings are not all the same kind: some are attrition and some are a
 * change of scope, and one shared axis would present those as the same story.
 *
 * The numbers are the visualisation. Each step says what it is, who counted
 * it, and — only where the comparison is like for like — what share of the
 * step above survived.
 */
export default async function CensusPage() {
  const census = await supplyCensus();
  const { steps, byCategory, byVerdict, prices, probes } = census;

  return (
    <div className="flex flex-col gap-10 pt-6">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Liveness census
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          A registry entry is a claim that an agent exists. Pokter calls the
          address to find out. This is how far the registry gets from that
          claim to an agent that answers, names a price, and has been checked
          by somebody other than us — measured across{' '}
          {formatCount(probes.total)} {plural(probes.total, 'probe').split(' ')[1]}{' '}
          over {formatCount(probes.sweeps)} {plural(probes.sweeps, 'sweep').split(' ')[1]}.
        </p>
      </header>

      <ol className="flex flex-col divide-y divide-[color:var(--border)] border-y border-[color:var(--border)]">
        {steps.map((step, i) => {
          const previous = i > 0 ? steps[i - 1] : null;
          const share =
            step.comparable &&
            previous?.value != null &&
            previous.value > 0 &&
            step.value != null
              ? step.value / previous.value
              : null;

          return (
            <li key={step.label} className="flex flex-col gap-2 py-5 sm:flex-row sm:items-baseline sm:gap-6">
              <div className="flex shrink-0 items-baseline gap-3 sm:w-52">
                <span className="tabular font-[family-name:var(--font-serif)] text-2xl">
                  {step.value === null
                    ? '—'
                    : step.value > 9999
                      ? formatCompact(step.value)
                      : formatCount(step.value)}
                </span>
                {share !== null && (
                  <span className="tabular text-[11px] text-[color:var(--text-faint)]">
                    {formatPercent(share)} of above
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-medium">
                  {step.label}
                  <span className="text-[9px] uppercase tracking-wide text-[color:var(--text-faint)]">
                    {step.provenance.replace('-', ' ')}
                  </span>
                </p>
                <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                  {step.note}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {/*
        Said once, plainly. A reader who has just come down that list is owed
        the conclusion rather than left to draw it and wonder whether they were
        supposed to.
      */}
      <p className="max-w-2xl text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
        The gap between the first number and the last is the reason this
        marketplace exists. Most of what is registered has never answered
        anything, and nothing on BNB Chain has yet been measured by two
        independent parties — which is why no agent here is Proven, and why
        Pokter publishes an empty top tier rather than awarding itself the
        corroboration.
      </p>

      <section className="grid gap-8 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
            Listed by category
          </h2>
          <dl className="flex flex-col divide-y divide-[color:var(--border)]">
            {byCategory.map((c) => (
              <div key={c.id} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="text-[13px]">
                  <Link
                    href={`/categories/${c.id}`}
                    className="hover:underline"
                  >
                    {c.label}
                  </Link>
                </dt>
                <dd className="tabular text-[13px] font-medium">{c.count}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
            Listed by evidence state
          </h2>
          <dl className="flex flex-col divide-y divide-[color:var(--border)]">
            {byVerdict.map((v) => (
              <div key={v.verdict} className="flex items-baseline justify-between gap-3 py-2">
                <dt>
                  <EvidenceBadge verdict={v.verdict} />
                </dt>
                <dd className="tabular text-[13px] font-medium">{v.count}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="flex max-w-2xl flex-col gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
          What the priced agents charge
        </h2>
        {prices.length === 0 ? (
          <p className="text-[13px] text-[color:var(--text-muted)]">
            No listed agent has returned a signed quote yet.
          </p>
        ) : (
          <>
            <p className="mono flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
              {prices.map((p, i) => (
                <span key={`${p}-${i}`}>{formatQuotedPrice(p)}</span>
              ))}
            </p>
            <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
              Every price an agent has signed for itself, in order. The lowest
              is a single wei — a real quote, and shown as a bound rather than
              rounded to nothing. Prices are captured during sweeps and expire
              in minutes, so these are dated observations rather than a tariff.
            </p>
          </>
        )}
      </section>

      <p className="max-w-2xl text-[11px] leading-relaxed text-[color:var(--text-faint)]">
        Counts move with every sweep. How each one is produced is in the{' '}
        <Link href="/methodology" className="underline decoration-dotted underline-offset-2">
          methodology
        </Link>
        , and the same figures are readable at{' '}
        <a href="/api/v1" className="mono underline decoration-dotted underline-offset-2">
          /api/v1
        </a>
        .
      </p>
    </div>
  );
}
