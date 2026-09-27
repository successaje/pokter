'use client';

import Link from 'next/link';
import { useState } from 'react';

import { cn } from '@/lib/ui/cn';
import { formatPercent } from '@/lib/ui/format';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import type { Verdict } from '@/lib/proof/engine';

/** Compare renders at most four columns before a row stops being readable. */
const MAX_COMPARE = 4;

export interface RankingRow {
  key: string;
  href: string;
  rank: number;
  name: string;
  categoryLabel: string | null;
  score: string;
  coverage: string;
  verdict: Verdict;
  uptime: number | null;
  probes: number;
}

/**
 * The rankings table, with the rows selectable.
 *
 * The table answered "who is ahead" and then left you to answer "and how do
 * these two differ" by memorising two names, walking to Compare and searching
 * for them again. Ranking is where that question gets asked, so the shortlist
 * is now built where it gets asked.
 *
 * The cap is the one Compare already enforces. Rather than letting you pick a
 * fifth and silently dropping it on arrival, the remaining boxes disable and
 * say why: the constraint is Compare's, and it is better admitted here than
 * discovered there.
 */
export function RankingTable({ rows }: { rows: RankingRow[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const full = selected.length >= MAX_COMPARE;

  const toggle = (key: string) =>
    setSelected((current) =>
      current.includes(key)
        ? current.filter((k) => k !== key)
        : current.length >= MAX_COMPARE
          ? current
          : [...current, key],
    );

  return (
    <div className="hidden md:block">
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[color:var(--border)]">
        <table className="w-full min-w-[760px] border-collapse bg-[color:var(--surface)]">
          <thead>
            <tr className="border-b border-[color:var(--border)] text-left">
              <th scope="col" className="w-10 p-4">
                <span className="sr-only">Select to compare</span>
              </th>
              {['#', 'Agent', 'Score', 'Measured on', 'Evidence', 'Uptime', 'Probes'].map(
                (heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="p-4 text-[10px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]"
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const checked = selected.includes(row.key);
              const disabled = full && !checked;
              return (
                <tr
                  key={row.key}
                  className={cn(
                    'border-b border-[color:var(--border)] transition-colors last:border-b-0',
                    checked
                      ? 'bg-[color:var(--brand-highlight-soft)]'
                      : 'hover:bg-[color:var(--surface-hover)]',
                  )}
                >
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(row.key)}
                      aria-label={`Compare ${row.name}`}
                      title={
                        disabled
                          ? `Compare holds ${MAX_COMPARE} agents. Clear one to add another.`
                          : undefined
                      }
                      className="size-3.5 accent-[color:var(--brand)] disabled:opacity-40"
                    />
                  </td>
                  <td className="tabular p-4 text-[13px] text-[color:var(--text-faint)]">
                    {row.rank}
                  </td>
                  <td className="p-4">
                    <Link
                      href={row.href}
                      className="text-[13px] font-medium hover:underline"
                    >
                      {row.name}
                    </Link>
                    {row.categoryLabel && (
                      <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                        {row.categoryLabel}
                      </span>
                    )}
                  </td>
                  <td className="tabular p-4 text-[13px]">{row.score}</td>
                  <td className="tabular p-4 text-[11px] text-[color:var(--text-muted)]">
                    {row.coverage}
                  </td>
                  <td className="p-4">
                    <EvidenceBadge verdict={row.verdict} />
                  </td>
                  <td className="tabular p-4 text-[13px]">
                    {row.uptime === null ? (
                      <span className="text-[color:var(--text-faint)]">—</span>
                    ) : (
                      formatPercent(row.uptime)
                    )}
                  </td>
                  <td className="tabular p-4 text-[13px] text-[color:var(--text-muted)]">
                    {row.probes}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/*
        The bar appears only once something is selected, and it sticks to the
        bottom of the viewport rather than sitting at the end of a long table,
        because the pair you want to compare is rarely the last two rows.
      */}
      {selected.length > 0 && (
        <div className="sticky bottom-4 z-20 mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] px-4 py-3 shadow-lg">
          <p className="text-[12px] text-[color:var(--text-muted)]">
            <span className="tabular font-medium text-[color:var(--text)]">
              {selected.length}
            </span>{' '}
            selected
            {full && (
              <span className="text-[color:var(--text-faint)]">
                {' '}
                · the most Compare holds
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected([])}
              className="rounded-[var(--radius)] px-2.5 py-1.5 text-[12px] text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text)]"
            >
              Clear
            </button>
            <Link
              href={`/compare?agents=${encodeURIComponent(selected.join(','))}`}
              className="rounded-[var(--radius)] bg-[color:var(--brand)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--brand-ink)] transition-opacity hover:opacity-90"
            >
              Compare{' '}
              {selected.length === 1 ? 'this agent' : `these ${selected.length}`} →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
