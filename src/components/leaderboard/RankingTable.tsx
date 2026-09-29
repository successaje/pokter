'use client';

import Link from 'next/link';
import { useState } from 'react';

import { cn } from '@/lib/ui/cn';
import { formatPercent } from '@/lib/ui/format';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import {
  FAILING_MAX_SCORE,
  PROVEN_MIN_SCORE,
  type Verdict,
} from '@/lib/proof/engine';

/** Compare renders at most four columns before a row stops being readable. */
const MAX_COMPARE = 4;

export interface RankingRow {
  key: string;
  href: string;
  rank: number;
  name: string;
  categoryLabel: string | null;
  score: string;
  /** The same figure unformatted, for the bar. Null when nothing was measured. */
  scoreValue: number | null;
  coverage: string;
  verdict: Verdict;
  uptime: number | null;
  probes: number;
}

/*
 * The top three carry a medal rather than a number.
 *
 * A ranking whose first row looks exactly like its fortieth is a sorted list,
 * not a ranking — the position was in a faint grey column an eye slides past.
 * These are the only rows where the rank itself is the information.
 *
 * Gold is the brand; silver and bronze are neutral and warm respectively, so
 * the three read as a set without inventing colours the product does not own.
 */
const MEDALS: Record<number, { ring: string; fill: string; text: string }> = {
  1: {
    ring: 'ring-[color:var(--brand)]',
    fill: 'bg-[color:var(--brand)]',
    text: 'text-[color:var(--brand-ink)]',
  },
  2: {
    ring: 'ring-[color:var(--border-strong)]',
    fill: 'bg-[color:var(--surface-raised)]',
    text: 'text-[color:var(--text)]',
  },
  3: {
    ring: 'ring-[color:var(--caution)]/50',
    fill: 'bg-[color:var(--caution-dim)]',
    text: 'text-[color:var(--caution)]',
  },
};

function RankMark({ rank }: { rank: number }) {
  const medal = MEDALS[rank];
  if (!medal) {
    return (
      <span className="tabular text-[13px] text-[color:var(--text-faint)]">
        {rank}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'tabular inline-flex size-7 items-center justify-center rounded-full text-[12px] font-bold ring-1',
        medal.ring,
        medal.fill,
        medal.text,
      )}
    >
      {rank}
    </span>
  );
}

/*
 * The score as a bar as well as a number.
 *
 * Forty rows of two-digit numbers is a table you read one cell at a time. The
 * bar is the same figure, scannable down the column, and it stops at the
 * measured value rather than implying a full scale — an unmeasured score
 * renders as no bar at all, not as an empty one.
 */
function ScoreMeter({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="flex min-w-[5.5rem] items-center gap-2.5">
      <span className="tabular w-8 text-[13px] font-semibold">{label}</span>
      {value === null ? (
        <span className="text-[10px] text-[color:var(--text-faint)]">
          not measured
        </span>
      ) : (
        <span
          aria-hidden
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--bg-subtle)]"
        >
          <span
            className="block h-full rounded-full bg-[color:var(--brand)]"
            style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
          />
        </span>
      )}
    </div>
  );
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
                    // The leader gets a rule down its left edge, so the eye
                    // lands on the top of the ranking before reading anything.
                    !checked && row.rank === 1 && 'bg-[color:var(--bg-subtle)]',
                    row.rank <= 3 &&
                      'border-l-2 border-l-[color:var(--brand)]',
                    row.rank === 2 && 'border-l-[color:var(--border-strong)]',
                    row.rank === 3 && 'border-l-[color:var(--caution)]',
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
                  <td className="p-4">
                    <RankMark rank={row.rank} />
                  </td>
                  <td className="p-4">
                    <Link
                      href={row.href}
                      className={cn(
                        'hover:underline',
                        row.rank <= 3
                          ? 'text-[14px] font-semibold'
                          : 'text-[13px] font-medium',
                      )}
                    >
                      {row.name}
                    </Link>
                    {row.categoryLabel && (
                      <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                        {row.categoryLabel}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <ScoreMeter value={row.scoreValue} label={row.score} />
                  </td>
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
                      <span
                        className={cn(
                          'font-medium',
                          // The same thresholds the verdict engine uses, so a
                          // green figure here never sits beside a Failing badge.
                          row.uptime >= PROVEN_MIN_SCORE
                            ? 'text-[color:var(--positive)]'
                            : row.uptime < FAILING_MAX_SCORE
                              ? 'text-[color:var(--negative)]'
                              : 'text-[color:var(--text)]',
                        )}
                      >
                        {formatPercent(row.uptime)}
                      </span>
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
