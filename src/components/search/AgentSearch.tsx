'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';

import { cn } from '@/lib/ui/cn';
import { Sheet } from '@/components/ui/Sheet';
import { useIsPhone } from '@/lib/ui/useIsPhone';
import {
  VOCABULARY,
  describeQualifier,
  parseQuery,
  stringifyQuery,
} from '@/lib/search/query';
import { useDismissibleLayer } from '@/lib/ui/useDismissibleLayer';

/**
 * Search with a query syntax, and dropdowns that write that syntax.
 *
 * The dropdowns exist so the language is discoverable: clicking "Proven"
 * inserts `is:proven` into the box, so a user learns the vocabulary by using
 * the obvious control. Chips then show what is actually applied and remove
 * themselves, which keeps the state visible rather than hidden in a filter
 * panel someone forgot they set.
 *
 * The query lives in the URL, so a filtered view is shareable and reproducible.
 */
const FILTER_GROUPS: { label: string; hint: string; options: string[] }[] = [
  {
    label: 'Evidence',
    hint: 'What has been observed about the agent',
    options: [
      'is:proven',
      'is:emerging',
      'is:observed',
      'is:unproven',
      'is:failing',
    ],
  },
  {
    label: 'Endpoint',
    hint: 'Whether it answers when called',
    options: ['is:live', 'is:responsive', 'is:offline', 'is:measured', 'is:unmeasured', 'has:endpoint'],
  },
  {
    label: 'Hiring',
    hint: 'Price and the action Pokter can safely offer',
    options: ['is:hireable', 'has:price', 'has:price<=0.1', 'is:escrow-only'],
  },
  {
    label: 'Category',
    hint: 'Publisher-declared, not observed',
    options: VOCABULARY.tags.map((tag) => `tag:${tag}`),
  },
  {
    label: 'Depth',
    hint: 'How much evidence exists',
    options: [
      'has:attestations',
      'has:attestations>1',
      'has:probes>10',
      'has:measurers>1',
      'has:days>1',
    ],
  },
];

export function AgentSearch({ resultCount }: { resultCount: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get('q') ?? '';

  const [draft, setDraft] = useState(initial);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const isPhone = useIsPhone();
  const activeGroup = FILTER_GROUPS.find((g) => g.label === openGroup) ?? null;
  const closeFilters = useCallback(() => setOpenGroup(null), []);
  const filtersRef = useDismissibleLayer<HTMLDivElement>({
    open: openGroup !== null,
    onDismiss: closeFilters,
  });

  const parsed = parseQuery(initial);

  const commit = (query: string) => {
    const trimmed = query.trim();
    router.push(trimmed ? `/agents?q=${encodeURIComponent(trimmed)}` : '/agents');
  };

  const addToken = (token: string) => {
    const next = initial.includes(token) ? initial : `${initial} ${token}`.trim();
    setDraft(next);
    setOpenGroup(null);
    commit(next);
  };

  const removeAt = (index: number) => {
    const next = stringifyQuery(parsed.qualifiers.filter((_, i) => i !== index));
    setDraft(next);
    commit(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-row gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit(draft);
          }}
          placeholder="Search by strategy, protocol, capability… or try is:proven has:probes>10"
          aria-label="Search agents"
          className="flex-1 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-3 py-2 text-[13px] placeholder:text-[color:var(--text-faint)]"
        />
        <button
          type="button"
          onClick={() => commit(draft)}
          className="action-primary rounded-[var(--radius)] px-4 py-2 text-[13px]"
        >
          Search
        </button>
      </div>

      {/*
        One scrolling row on a phone instead of two wrapped ones. `-mx-1 px-1`
        lets the row bleed to the screen edge so a half-visible chip signals
        there is more, rather than ending flush and looking complete.
      */}
      <div
        ref={filtersRef}
        className="-mx-1 flex snap-x items-center gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
      >
        {FILTER_GROUPS.map((group) => (
          <div key={group.label} className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenGroup((current) => (current === group.label ? null : group.label))
              }
              aria-expanded={openGroup === group.label}
              className={cn(
                'shrink-0 snap-start rounded-[var(--radius)] border px-2.5 py-1.5 text-[12px] transition-colors',
                openGroup === group.label
                  ? 'border-[color:var(--border-strong)] bg-[color:var(--surface-raised)]'
                  : 'border-[color:var(--border)] text-[color:var(--text-muted)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text)]',
              )}
            >
              {group.label} ▾
            </button>

            {/*
              Desktop keeps the anchored popover. A phone cannot: this row
              scrolls sideways, and `overflow-x: auto` computes `overflow-y`
              to `auto` as well, so the panel was clipped 170px below the row
              with no way to reach the options. The sheet escapes the scroll
              container entirely, and gives the options a real tap target
              while it is there.
            */}
            {openGroup === group.label && (
              <div className="absolute left-0 top-full z-30 mt-1.5 hidden w-64 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] p-2 shadow-xl md:block">
                <p className="px-1 pb-1.5 text-[10px] leading-relaxed text-[color:var(--text-faint)]">
                  {group.hint}
                </p>
                <div className="flex flex-col">
                  {group.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => addToken(option)}
                      className="mono rounded-[4px] px-2 py-1.5 text-left text-[11px] text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        <span className="tabular ml-auto text-[11px] text-[color:var(--text-muted)]">
          {resultCount} agent{resultCount === 1 ? '' : 's'}
        </span>
      </div>

      <Sheet
        open={isPhone && openGroup !== null}
        onClose={() => setOpenGroup(null)}
        title={activeGroup ? activeGroup.label : ''}
        description={activeGroup?.hint}
      >
        <div className="flex flex-col gap-1">
          {activeGroup?.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                addToken(option);
                setOpenGroup(null);
              }}
              className="mono flex items-center rounded-[var(--radius)] px-3 text-left text-[13px] text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]"
            >
              {option}
            </button>
          ))}
        </div>
      </Sheet>

      {parsed.qualifiers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {parsed.qualifiers.map((qualifier, index) => (
            <button
              key={`${qualifier.kind}-${index}`}
              type="button"
              onClick={() => removeAt(index)}
              className="group inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border-strong)]"
            >
              {describeQualifier(qualifier)}
              <span
                aria-hidden
                className="text-[color:var(--text-faint)] group-hover:text-[color:var(--negative)]"
              >
                ✕
              </span>
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setDraft('');
              commit('');
            }}
            className="px-1.5 text-[11px] text-[color:var(--text-faint)] underline underline-offset-2 hover:text-[color:var(--text)]"
          >
            Clear
          </button>
        </div>
      )}

      {parsed.unknown.length > 0 && (
        /* Never silently drop a term — a filter the user thinks is applied and
           is not is worse than an error. */
        <p className="text-[11px] leading-relaxed text-[color:var(--caution)]">
          Ignored {parsed.unknown.map((t) => `"${t}"`).join(', ')} — not a
          recognised filter. Valid prefixes are is:, has: and tag:.
        </p>
      )}
    </div>
  );
}
