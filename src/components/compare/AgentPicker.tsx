'use client';

import { useOptimistic, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/ui/cn';

export interface PickerOption {
  key: string;
  name: string;
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

  return (
    <section className="flex flex-col gap-6" aria-busy={isPending}>
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[color:var(--border)] pb-3">
        <h2 className="text-base font-medium tracking-tight">Choose agents</h2>
        <p className="flex items-center gap-2 text-[11px] text-[color:var(--text-faint)]">
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

      {Object.entries(grouped).map(([label, group]) => (
        <div key={label} className="flex flex-col gap-2.5">
          <h3 className="text-xs text-[color:var(--text-muted)]">{label}</h3>
          <div className="flex flex-wrap gap-2">
            {group.map((option) => {
              const isSelected = shown.includes(option.key);
              const disabled = full && !isSelected;

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => toggle(option.key)}
                  disabled={disabled}
                  aria-pressed={isSelected}
                  className={cn(
                    'cursor-pointer rounded-[var(--radius)] border px-3 py-2 text-[12px] transition-colors',
                    isSelected
                      ? 'border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] text-[color:var(--text)]'
                      : 'border-[color:var(--border)] text-[color:var(--text-muted)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text)]',
                    disabled && 'cursor-not-allowed opacity-40 hover:border-[color:var(--border)]',
                  )}
                >
                  {isSelected && (
                    <span aria-hidden className="mr-1.5 text-[color:var(--positive)]">
                      ✓
                    </span>
                  )}
                  {option.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
