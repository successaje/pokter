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
  /*
   * The wrapper is the container the labels measure themselves against.
   *
   * The short label used to appear below the `sm` viewport breakpoint, which
   * is the wrong thing to ask: what decides whether three labels fit is the
   * width of the control, not the width of the window. Inside the hire
   * drawer — a 480px panel on a desktop — the viewport said there was room
   * and the panel did not, so the full labels were laid out in equal columns
   * that could not hold them and printed over one another.
   *
   * It is always `w-full`, and the caller's className goes to the control
   * inside it rather than here. `container-type: inline-size` suppresses an
   * element's intrinsic width, so a wrapper left to size itself from its
   * contents resolves to zero — as a flex item with `w-auto` it collapsed
   * entirely and stacked all three buttons at the same x. A percentage
   * width is definite and does not depend on the contents, so the
   * containment has nothing to swallow. Callers constrain the control, not
   * the container.
   */
  return (
    <div className="@container w-full">
    <div role="radiogroup" aria-label={label} className={cn('grid auto-cols-fr grid-flow-col rounded-md border border-line bg-canvas-subtle p-0.5', className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            /*
             * The full label, always, whichever one is painted. Hiding a
             * span hides it from assistive technology too, so without this
             * a narrow control would announce "Monitor" for a button whose
             * job is "Produce a monitoring report".
             */
            aria-label={option.short ? option.label : undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              'tap-safe flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 font-medium transition-colors sm:px-3',
              size === 'sm' ? 'h-7 text-small' : 'h-8 text-body-s',
              selected ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'text-ink-muted hover:text-ink',
            )}
          >
            <span className={option.short ? 'hidden @lg:inline' : undefined}>{option.label}</span>
            {option.short && <span className="@lg:hidden">{option.short}</span>}
            {option.detail !== undefined && <span className={cn('tabular text-caption', selected ? 'text-ink-muted' : 'text-ink-faint')}>{option.detail}</span>}
          </button>
        );
      })}
    </div>
    </div>
  );
}
