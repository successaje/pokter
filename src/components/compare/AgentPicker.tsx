'use client';

import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/ui/cn';
import { AgentAvatar } from '@/components/agent/AgentAvatar';

export interface PickerOption {
  key: string;
  name: string;
  imageUrl: string | null;
  description: string;
  category: string;
  categoryLabel: string;
}

/**
 * Selecting agents to compare.
 *
 * Selection lives in the URL so a comparison stays shareable, but a plain link
 * meant the browser sat silent for the second or so the server took to
 * re-render — long enough to read as broken and invite a second click on a
 * different agent. The chip now flips the moment it is pressed and the results
 * mark themselves busy, so the wait is visibly a wait rather than nothing.
 */
export function AgentPicker({
  options,
  selected,
  max,
}: {
  options: PickerOption[];
  selected: string[];
  max: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Reflects the click immediately; React reconciles it with the server's
  // answer when the navigation lands.
  const [shown, addOptimistic] = useOptimistic(
    selected,
    (current: string[], key: string) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key].slice(0, max),
  );

  const toggle = (key: string) => {
    const next = shown.includes(key)
      ? shown.filter((entry) => entry !== key)
      : [...shown, key].slice(0, max);

    startTransition(() => {
      addOptimistic(key);
      router.push(next.length === 0 ? '/compare' : `/compare?agents=${next.join(',')}`, {
        scroll: false,
      });
    });
  };

  const grouped = options.reduce<Record<string, PickerOption[]>>((acc, option) => {
    acc[option.categoryLabel] = [...(acc[option.categoryLabel] ?? []), option];
    return acc;
  }, {});

  const full = shown.length >= max;
  const normalisedQuery = query.trim().toLowerCase();
  const matches = useMemo(
    () => normalisedQuery
      ? options.filter((option) => `${option.name} ${option.description} ${option.categoryLabel}`.toLowerCase().includes(normalisedQuery)).slice(0, 16)
      : [],
    [normalisedQuery, options],
  );

  const optionCard = (option: PickerOption) => {
    const isSelected = shown.includes(option.key);
    const disabled = full && !isSelected;
    return (
      <article key={option.key} className={cn('relative flex min-w-0 items-center gap-2.5 rounded-[var(--radius)] border bg-[color:var(--surface)] p-2.5 transition-colors', isSelected ? 'border-[color:var(--brand)]/55 bg-[color:var(--brand-highlight-soft)]' : 'border-[color:var(--border)] hover:border-[color:var(--border-strong)]')}>
        <AgentAvatar name={option.name} src={option.imageUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-[12px] font-medium">{option.name}</h4>
          <p className="mt-0.5 line-clamp-1 text-[10px] text-[color:var(--text-faint)]">{option.description}</p>
        </div>
        <button
          type="button"
          onClick={() => toggle(option.key)}
          disabled={disabled}
          aria-label={isSelected ? `Remove ${option.name} from comparison` : `Add ${option.name} to comparison`}
          aria-pressed={isSelected}
          className={cn('flex size-8 shrink-0 items-center justify-center rounded-full border text-lg leading-none transition-colors', isSelected ? 'border-[color:var(--brand)] bg-[color:var(--brand)] text-[color:var(--brand-ink)]' : 'border-[color:var(--border-strong)] bg-[color:var(--bg)] text-[color:var(--text-muted)] hover:text-[color:var(--text)]', disabled && 'cursor-not-allowed opacity-35')}
        >
          <span aria-hidden>{isSelected ? '✓' : '+'}</span>
        </button>
      </article>
    );
  };

  return (
    <section className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-4 sm:p-5" aria-busy={isPending}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-base font-medium tracking-tight">Choose agents to compare</h2><p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">Search directly or browse by what the agent does.</p></div>
        <p className="flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-[11px] text-[color:var(--text-faint)]">
          {isPending && (
            <span
              aria-hidden
              className="inline-block size-2.5 animate-spin rounded-full border border-[color:var(--border-strong)] border-t-[color:var(--text)]"
            />
          )}
          {shown.length} of {max} selected
          {full && ' · deselect one to swap'}
        </p>
      </div>

      {shown.length > 0 && (
        <div className="flex flex-wrap gap-2 border-y border-[color:var(--border)] py-3">
          {shown.map((key, index) => {
            const option = options.find((candidate) => candidate.key === key);
            if (!option) return null;
            return <button key={key} type="button" onClick={() => toggle(key)} className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-2.5 py-1.5 text-[11px] font-medium"><span className="tabular flex size-4 items-center justify-center rounded-full bg-[color:var(--brand)] text-[9px] text-[color:var(--brand-ink)]">{index + 1}</span><span className="max-w-40 truncate">{option.name}</span><span aria-hidden className="text-[color:var(--text-faint)]">×</span></button>;
          })}
        </div>
      )}

      <label className="relative block">
        <span className="sr-only">Search agents to compare</span>
        <svg viewBox="0 0 24 24" aria-hidden className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 fill-none stroke-[color:var(--text-faint)]" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by agent name, category or capability" className="w-full rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] py-3 pl-10 pr-4 text-[13px] outline-none transition-shadow focus:ring-2 focus:ring-[color:var(--brand)]/25" />
      </label>

      {normalisedQuery ? (
        <div>
          <p className="mb-2 text-[11px] text-[color:var(--text-muted)]">{matches.length ? `${matches.length} matching agents` : 'No matching agents'}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{matches.map(optionCard)}</div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(grouped).map(([label, group]) => {
            const visible = expanded[label] ? group : group.slice(0, 2);
            return (
              <div key={label} className="min-w-0">
                <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-[12px] font-semibold">{label}</h3><span className="text-[10px] text-[color:var(--text-faint)]">{group.length}</span></div>
                <div className="flex flex-col gap-2">{visible.map(optionCard)}</div>
                {group.length > 2 && <button type="button" onClick={() => setExpanded((current) => ({ ...current, [label]: !current[label] }))} className="mt-2 text-[11px] font-medium text-[color:var(--info)] hover:underline">{expanded[label] ? 'Show less' : `View ${group.length - 2} more`}</button>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
