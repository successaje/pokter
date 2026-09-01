import Link from 'next/link';

import { cn } from '@/lib/ui/cn';
import { formatMs, formatPercent, formatScore } from '@/lib/ui/format';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { VERDICT_LABEL } from '@/lib/proof/engine';
import type { Comparison } from '@/lib/marketplace';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';

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
    rank: (e) => ({ proven: 3, emerging: 2, unproven: 1, failing: 0 })[e.proof.verdict],
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

  return (
    <div className="flex flex-col gap-4">
      {mixed && (
        /* §23. Category-specific scoring means cross-category totals are not
           like-for-like, and saying so is more useful than hiding the mixture. */
        <p className="rounded-[var(--radius)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-3 text-[11px] leading-relaxed text-[color:var(--caution)]">
          These agents span {categories.size} categories. A health-factor monitor
          and a grid trader are judged on different things, so treat the shared
          rows — uptime, evidence, responsiveness — as the comparable ones.
        </p>
      )}

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[color:var(--border)]">
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
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                        {meta?.label ?? 'Unclassified'}
                      </span>
                      <Link
                        href={`/agents/${entry.agent.chain_id}/${entry.agent.token_id}`}
                        className="text-[13px] font-medium leading-snug hover:underline"
                      >
                        {entry.agent.name}
                      </Link>
                      <EvidenceBadge verdict={entry.proof.verdict} />
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
                      <span className="mt-0.5 block text-[10px] leading-relaxed text-[color:var(--text-faint)]">
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
                          ? 'font-medium text-[color:var(--positive)]'
                          : 'text-[color:var(--text)]',
                      )}
                    >
                      {row.value(entry)}
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
