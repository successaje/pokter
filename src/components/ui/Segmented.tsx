'use client';

import { cn } from '@/lib/ui/cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** A shorter label for narrow screens. */
  short?: string;
  /** A count or short figure shown after the label. */
  detail?: string | number;
}

/**
 * A segmented control: one of a few choices, all visible, the chosen one
 * filled. For sets of two to five where a dropdown would hide the options.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-grid auto-cols-fr grid-flow-col rounded-md border border-line bg-canvas-subtle p-0.5', className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'tap-safe flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 font-medium transition-colors sm:px-3',
              size === 'sm' ? 'h-7 text-small' : 'h-8 text-body-s',
              selected ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'text-ink-muted hover:text-ink',
            )}
          >
            <span className={option.short ? 'hidden sm:inline' : undefined}>{option.label}</span>
            {option.short && <span className="sm:hidden">{option.short}</span>}
            {option.detail !== undefined && <span className={cn('tabular text-caption', selected ? 'text-ink-muted' : 'text-ink-faint')}>{option.detail}</span>}
          </button>
        );
      })}
    </div>
  );
}
