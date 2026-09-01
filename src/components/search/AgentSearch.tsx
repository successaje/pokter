'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { cn } from '@/lib/ui/cn';
import {
  VOCABULARY,
  describeQualifier,
  parseQuery,
  stringifyQuery,
} from '@/lib/search/query';

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
    options: ['is:proven', 'is:emerging', 'is:unproven', 'is:failing'],
  },
  {
    label: 'Endpoint',
    hint: 'Whether it answers when called',
    options: ['is:live', 'is:offline', 'is:measured', 'is:unmeasured', 'has:endpoint'],
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
      <div className="flex flex-col gap-2 sm:flex-row">
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
          className="rounded-[var(--radius)] bg-[color:var(--text)] px-4 py-2 text-[13px] font-medium text-[color:var(--bg)] transition-opacity hover:opacity-90"
        >
          Search
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTER_GROUPS.map((group) => (
          <div key={group.label} className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenGroup((current) => (current === group.label ? null : group.label))
              }
              aria-expanded={openGroup === group.label}
              className={cn(
                'rounded-[var(--radius)] border px-2.5 py-1.5 text-[12px] transition-colors',
                openGroup === group.label
                  ? 'border-[color:var(--border-strong)] bg-[color:var(--surface-raised)]'
                  : 'border-[color:var(--border)] text-[color:var(--text-muted)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text)]',
              )}
            >
              {group.label} ▾
            </button>

            {openGroup === group.label && (
              <div className="absolute left-0 top-full z-30 mt-1.5 w-64 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] p-2 shadow-xl">
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
