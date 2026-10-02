import Link from 'next/link';

import { cn } from '@/lib/ui/cn';
import { formatMs, formatPercent, formatScore } from '@/lib/ui/format';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { VERDICT_LABEL } from '@/lib/proof/engine';
import type { Comparison } from '@/lib/marketplace';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';

/**
 * One comparable row.
 *
 * `value` renders the cell. `rank` is the number used to decide which cell wins,
 * and returning null means "not comparable" — a row where some agents have no
 * data highlights only among those that do, and never treats missing data as a
 * zero that loses.
 */
interface Row {
  label: string;
  hint?: string;
  value: (entry: Comparison) => string;
  rank?: (entry: Comparison) => number | null;
  /** Lower is better for this row. */
  lowerWins?: boolean;
}

const ROWS: Row[] = [
  {
    label: 'Pokter Score',
    hint: 'Rescaled across measurable dimensions',
    value: (e) => formatScore(e.score.overall),
    rank: (e) => e.score.overall,
  },
  {
    label: 'Measured on',
    hint: 'How much of the score is backed by data',
    value: (e) => `${e.score.measuredDimensions} of ${e.score.totalDimensions}`,
    rank: (e) => e.score.measuredDimensions,
  },
  {
    label: 'Evidence',
    value: (e) => VERDICT_LABEL[e.proof.verdict],
    // Ordered by how much Pokter knows, so "not measured" outranks "failing":
    // an unexamined agent is unknown, a failing one is known to be bad.
    rank: (e) =>
      ({
        proven: 5,
        reliable: 4,
        emerging: 3,
        observed: 2,
        unproven: 1,
        failing: 0,
      })[
        e.proof.verdict
      ],
  },
  {
    label: 'Uptime',
    hint: 'Across probes Pokter has taken',
    value: (e) =>
      e.record.totalProbes === 0
        ? 'Not measured'
        : formatPercent(e.record.totalAnswered / e.record.totalProbes),
    rank: (e) =>
      e.record.totalProbes === 0
        ? null
        : e.record.totalAnswered / e.record.totalProbes,
  },
  {
    label: 'Probes taken',
    value: (e) => String(e.record.totalProbes),
    rank: (e) => e.record.totalProbes,
  },
  {
    label: 'Median response',
    value: (e) =>
      formatMs(
        [...e.record.windows].reverse().find((w) => w.medianMs !== null)?.medianMs ??
          null,
      ),
    rank: (e) =>
      [...e.record.windows].reverse().find((w) => w.medianMs !== null)?.medianMs ??
      null,
    lowerWins: true,
  },
  {
    label: 'Independent measurers',
    hint: 'More parties checking is a stronger claim',
    value: (e) => (e.proof.measurers.length ? e.proof.measurers.join(', ') : 'None'),
    rank: (e) => e.proof.measurers.length,
  },
  {
    label: 'Observed for',
    value: (e) =>
      e.record.days.length === 0 ? 'Not measured' : `${e.record.days.length}d`,
    rank: (e) => (e.record.days.length === 0 ? null : e.record.days.length),
  },
  {
    label: 'Longest outage',
    hint: 'Consecutive failed probes',
    value: (e) =>
      e.record.totalProbes === 0
        ? 'Not measured'
        : String(e.record.longestOutage?.probes ?? 0),
    rank: (e) => (e.record.totalProbes === 0 ? null : e.record.longestOutage?.probes ?? 0),
    lowerWins: true,
  },
  {
    label: 'Responding recently',
    hint: 'Based on the latest 24-hour measurement window, not a live page-load probe',
    value: (e) => {
      const recent = e.record.windows.find((window) => window.label === '24h');
      if (!recent || recent.probes === 0) return 'Not measured';
      return recent.answered > 0 ? 'Yes' : 'No';
    },
    rank: (e) => {
      const recent = e.record.windows.find((window) => window.label === '24h');
      return !recent || recent.probes === 0 ? null : recent.answered > 0 ? 1 : 0;
    },
  },
  {
    label: 'Signed price',
    hint: 'Latest price signed by the agent; expired quotes are not treated as offers',
    value: (e) => {
      if (!e.quote) return 'No signed quote';
      if (!e.quoteCurrent) return 'Quote expired';
      return formatQuotedPrice(e.quote.priceU);
    },
    rank: (e) => {
      if (!e.quote || !e.quoteCurrent) return null;
      return e.quote.priceU;
    },
    lowerWins: true,
  },
  {
    label: 'Funded jobs',
    hint: 'ERC-8183 jobs attributed by Pokter’s immutable identity envelope',
    value: (e) => String(e.economicHistory.jobs),
    rank: (e) => e.economicHistory.jobs,
  },
  {
    label: 'Completed jobs',
    value: (e) => String(e.economicHistory.completed),
    rank: (e) => e.economicHistory.completed,
  },
  {
    label: 'Verified reviews',
    value: (e) => e.reviewAverage === null ? 'None' : `${e.reviewAverage.toFixed(1)}/5 · ${e.reviewCount}`,
    rank: (e) => e.reviewAverage,
  },
  {
    label: 'Returns / drawdown',
    hint: 'Not published by any measurer',
    value: () => 'Not enough data',
  },
];

function winners(row: Row, entries: Comparison[]): Set<number> {
  if (!row.rank || entries.length < 2) return new Set();

  const ranked = entries
    .map((entry, index) => ({ index, value: row.rank!(entry) }))
    .filter((r): r is { index: number; value: number } => r.value !== null);

  if (ranked.length < 2) return new Set();

  const best = row.lowerWins
    ? Math.min(...ranked.map((r) => r.value))
    : Math.max(...ranked.map((r) => r.value));

  // A row where everything ties has no winner worth highlighting.
  if (ranked.every((r) => r.value === best)) return new Set();

  return new Set(ranked.filter((r) => r.value === best).map((r) => r.index));
}

export function CompareTable({ entries }: { entries: Comparison[] }) {
  const categories = new Set(entries.map((e) => e.category));
  const mixed = categories.size > 1;
  const mostEstablished = [...entries].sort((a, b) =>
    b.economicHistory.completed - a.economicHistory.completed ||
    b.record.days.length - a.record.days.length,
  )[0];
  const priced = entries.filter((entry) => entry.quote && entry.quoteCurrent);
  const leastExpensive = [...priced].sort((a, b) => a.quote!.priceU - b.quote!.priceU)[0];

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-4">
        <h2 className="text-xs font-medium">What separates them</h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
          <strong className="text-[color:var(--text)]">{mostEstablished.agent.name}</strong>{' '}
          has the strongest established record here with {mostEstablished.economicHistory.completed}{' '}
          completed {mostEstablished.economicHistory.completed === 1 ? 'job' : 'jobs'} and{' '}
          {mostEstablished.record.days.length} observed {mostEstablished.record.days.length === 1 ? 'day' : 'days'}.
          {leastExpensive ? <> <strong className="text-[color:var(--text)]">{leastExpensive.agent.name}</strong> has the lowest current signed quote at {formatQuotedPrice(leastExpensive.quote!.priceU)}.</> : ' None of these agents has a current signed price, so price should not decide this comparison.'}
        </p>
      </section>
      {mixed && (
        /* §23. Category-specific scoring means cross-category totals are not
           like-for-like, and saying so is more useful than hiding the mixture. */
        <p className="rounded-[var(--radius)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-3 text-[12px] leading-relaxed text-[color:var(--caution)]">
          These agents span {categories.size} categories. A health-factor monitor
          and a grid trader are judged on different things, so treat the shared
          rows — uptime, evidence, responsiveness — as the comparable ones.
        </p>
      )}

      {/*
        §6. A phone gets one block per dimension, not a table.

        The six columns are 640px wide inside a 348px viewport, so comparing
        two agents meant scrolling sideways with the metric label scrolling out
        of view — the one thing that gives a number meaning. Here the label
        leads and the agents sit under it, which is the comparison the page is
        for, read in the direction a phone actually scrolls.

        The legend stays pinned so a value is never read against the wrong
        agent. Both layouts run the same ROWS and the same `winners`, so a cell
        highlighted on one is highlighted on the other.
      */}
      <div className="flex flex-col gap-3 md:hidden">
        <div className="sticky top-14 z-20 -mx-5 flex gap-2 border-b border-[color:var(--border)] bg-[color:var(--bg)]/95 px-5 py-2.5 backdrop-blur-md">
          {entries.map((entry, index) => (
            <div
              key={entry.agent.token_id}
              className="flex min-w-0 flex-1 flex-col gap-1"
            >
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="tabular flex size-4 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-raised)] text-[10px] text-[color:var(--text-muted)]"
                >
                  {index + 1}
                </span>
                <Link
                  href={`/agents/${entry.agent.chain_id}/${entry.agent.token_id}`}
                  className="min-w-0 truncate text-[12px] font-medium hover:underline"
                >
                  {entry.agent.name}
                </Link>
              </span>
              <EvidenceBadge verdict={entry.proof.verdict} />
            </div>
          ))}
        </div>

        {ROWS.map((row) => {
          const best = winners(row, entries);
          return (
            <section
              key={row.label}
              className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3"
            >
              <h3 className="text-xs font-medium text-[color:var(--text-secondary)]">
                {row.label}
              </h3>
              {row.hint && (
                <p className="mt-0.5 text-[12px] leading-relaxed text-[color:var(--text-faint)]">
                  {row.hint}
                </p>
              )}

              <dl className="mt-2.5 flex flex-col gap-1.5">
                {entries.map((entry, index) => (
                  <div
                    key={entry.agent.token_id}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <dt className="flex min-w-0 items-baseline gap-1.5">
                      <span
                        aria-hidden
                        className="tabular shrink-0 text-[10px] text-[color:var(--text-faint)]"
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0 truncate text-[11px] text-[color:var(--text-muted)]">
                        {entry.agent.name}
                      </span>
                    </dt>
                    <dd
                      className={cn(
                        'tabular flex shrink-0 items-baseline gap-2 text-right text-[13px]',
                        best.has(index) ? 'font-medium' : 'text-[color:var(--text)]',
                      )}
                    >
                      {row.value(entry)}
                      {best.has(index) && (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-[color:var(--brand-highlight)]">
                          Strongest
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-[var(--radius-lg)] border border-[color:var(--border)] md:block">
        <table className="w-full min-w-[640px] border-collapse bg-[color:var(--surface)]">
          <thead>
            <tr className="border-b border-[color:var(--border)]">
              <th scope="col" className="w-44 p-4 text-left text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
                Metric
              </th>
              {entries.map((entry) => {
                const meta =
                  entry.category === 'unclassified'
                    ? null
                    : CATEGORY_BY_ID.get(entry.category);
                return (
                  <th key={entry.agent.token_id} scope="col" className="p-4 text-left align-top">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start gap-2.5">
                        <AgentAvatar
                          name={entry.agent.name}
                          src={entry.agent.image_url}
                          size="sm"
                        />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-[13px] font-medium leading-snug">
                            {entry.agent.name}
                          </span>
                          <span className="text-[11px] text-[color:var(--text-faint)]">
                            {meta?.label ?? 'Unclassified'}
                          </span>
                        </div>
                      </div>
                      {/* w-fit, or the column's flex stretch turns the pill
                          into a full-width bar. */}
                      <EvidenceBadge
                        verdict={entry.proof.verdict}
                        className="w-fit"
                      />
                      {/*
                        A comparison ends in a decision, and this table used to
                        offer no way to act on one — the agent's name was a
                        link and that was all. Hire leads where the evidence
                        supports it, and the profile is always reachable.
                      */}
                      <div className="mt-1 flex flex-col gap-1.5">
                        {entry.proof.recommendedForHire ? (
                          <Link
                            href={`/hire/${entry.agent.chain_id}/${entry.agent.token_id}`}
                            className="action-primary block rounded-[var(--radius)] px-3 py-2 text-center text-[12px]"
                          >
                            Hire agent
                          </Link>
                        ) : null}
                        <Link
                          href={`/agents/${entry.agent.chain_id}/${entry.agent.token_id}`}
                          className="block rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-2 text-center text-[12px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
                        >
                          View profile
                        </Link>
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {ROWS.map((row) => {
              const best = winners(row, entries);
              return (
                <tr
                  key={row.label}
                  className="border-b border-[color:var(--border)] last:border-b-0"
                >
                  <th scope="row" className="p-4 text-left align-top">
                    <span className="block text-xs text-[color:var(--text-secondary)]">
                      {row.label}
                    </span>
                    {row.hint && (
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-[color:var(--text-faint)]">
                        {row.hint}
                      </span>
                    )}
                  </th>

                  {entries.map((entry, index) => (
                    <td
                      key={entry.agent.token_id}
                      className={cn(
                        'tabular p-4 align-top text-[13px]',
                        best.has(index)
                          ? 'bg-[color:var(--brand-highlight-soft)] font-medium'
                          : 'text-[color:var(--text)]',
                      )}
                    >
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        {row.value(entry)}
                        {/*
                          The word, not only the tint. Someone who cannot
                          separate the two backgrounds still reads which cell
                          leads — and "strongest" is the honest claim, scoped
                          to this row, where "best" would suggest a verdict
                          about the agent.
                        */}
                        {best.has(index) && (
                          <span className="text-[10px] font-medium uppercase tracking-wide text-[color:var(--brand-highlight)]">
                            Strongest
                          </span>
                        )}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
