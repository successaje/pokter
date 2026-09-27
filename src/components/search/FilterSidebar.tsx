'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

import { cn } from '@/lib/ui/cn';
import { parseQuery, stringifyQuery } from '@/lib/search/query';
import type { FilterGroup } from '@/lib/search/filters';

/**
 * The filter shelf, with the size of every outcome shown up front.
 *
 * The dropdowns this sits beside can only tell you what a filter did after
 * you have applied it and the page has reloaded. Counting first turns that
 * into a decision: "Proven 12" and "Failing 0" are different invitations, and
 * the second one saves a wasted click.
 *
 * A zero is shown rather than hidden. An empty category is a fact about the
 * marketplace — that nothing here has been proven yet is worth reading, and
 * quietly removing the row would make the shelf look healthier than the
 * registry is.
 */
export function FilterSidebar({
  groups,
  counts,
  className,
}: {
  groups: FilterGroup[];
  /** How many agents each option's query matches, keyed by that query. */
  counts: Record<string, number>;
  className?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get('q') ?? '';
  const parsed = parseQuery(raw);
  const active = new Set(parsed.qualifiers.map((q) => stringifyQuery([q])));

  const commit = useCallback(
    (next: string) => {
      const query = next.trim();
      router.push(query ? `/agents?q=${encodeURIComponent(query)}` : '/agents', {
        scroll: false,
      });
    },
    [router],
  );

  const toggle = (option: string) => {
    const already = active.has(option);
    const remaining = parsed.qualifiers
      .map((q) => stringifyQuery([q]))
      .filter((q) => q !== option);
    commit(already ? remaining.join(' ') : [...remaining, option].join(' '));
  };

  return (
    <aside className={cn('flex flex-col gap-6', className)}>
      <div className="flex items-baseline justify-between gap-3 border-b border-[color:var(--border)] pb-2">
        <h2 className="text-sm font-medium">Filters</h2>
        {active.size > 0 && (
          <button
            type="button"
            onClick={() => commit('')}
            className="text-[11px] text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text)]"
          >
            Clear all
          </button>
        )}
      </div>

      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-2">
          <div>
            <h3 className="text-[13px] font-medium">{group.label}</h3>
            <p className="mt-0.5 text-[11px] leading-snug text-[color:var(--text-faint)]">
              {group.hint}
            </p>
          </div>

          <ul className="flex flex-col">
            {group.options.map((option) => {
              const checked = active.has(option.query);
              const count = counts[option.query] ?? 0;
              return (
                <li key={option.query}>
                  <label
                    title={option.query}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 py-1.5 text-[12px] transition-colors',
                      /*
                       * An option matching nothing stays selectable — it is
                       * still a true statement about the marketplace — but it
                       * reads as the dead end it is.
                       */
                      count === 0 && !checked
                        ? 'text-[color:var(--text-faint)]'
                        : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text)]',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(option.query)}
                      className="size-3.5 shrink-0 accent-[color:var(--brand)]"
                    />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    <span className="tabular shrink-0 text-[11px] text-[color:var(--text-faint)]">
                      {count}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}
