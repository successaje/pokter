'use client';

import { useId, useState } from 'react';

import { cn } from '@/lib/ui/cn';

/**
 * A section that collapses on phones and stays open on desktop.
 *
 * The desktop constraint is absolute here: above 768px this must render as if
 * the component were not in the tree at all. So the content is always in the
 * DOM and always visible by default, and *only* a max-width media query hides
 * it when collapsed. Desktop never reads the open state, and the toggle is
 * `md:hidden`, which also keeps it out of the accessibility tree there.
 *
 * Why not `<details>`: browsers hide a closed details' content through
 * rendering rules that CSS cannot reliably re-show, so forcing it open on
 * desktop is not dependable. Why not a media-query hook: it would need the
 * client to decide the initial state, which either flashes or mismatches
 * hydration. A class plus a media query has neither problem.
 */
export function MobileDisclosure({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  /**
   * The §10 Level-2 line: one sentence of substance, readable while collapsed.
   * Without it a collapsed section is a row of furniture that tells a user
   * nothing about whether opening it is worth the tap.
   */
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className="mobile-disclosure">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left md:hidden"
      >
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold tracking-[-0.01em]">
            {title}
          </span>
          {summary && !open && (
            <span className="mt-0.5 block text-[13px] leading-snug text-[color:var(--text-muted)]">
              {summary}
            </span>
          )}
        </span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={cn(
            'size-5 shrink-0 fill-none stroke-current text-[color:var(--text-muted)] transition-transform',
            open && 'rotate-180',
          )}
          strokeWidth="1.8"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div
        id={contentId}
        className={cn('mobile-disclosure-content', open && 'is-open')}
      >
        {children}
      </div>
    </section>
  );
}
