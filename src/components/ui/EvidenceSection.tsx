'use client';

import { useId, useState } from 'react';

import { cn } from '@/lib/ui/cn';

/**
 * An evidence section: always open on desktop, collapsible on a phone.
 *
 * The agent detail page rendered every section at full provenance depth at
 * once, which made the product's most important decision screen 7.4 phone
 * screens long. This is §10's disclosure applied in place: the verdict and the
 * one-line summary stay visible, and the raw material — probe history,
 * attestations, transaction hashes — waits behind a tap.
 *
 * Desktop must not change at all, so its layout is preserved two ways: the
 * heading block is the same markup it always was, and the content wrapper is
 * `display: contents` above 768px, which makes the extra div invisible to
 * layout rather than merely unstyled.
 */
export function EvidenceSection({
  title,
  caption,
  summary,
  sectionClassName,
  children,
}: {
  title: string;
  /** The desktop sub-heading. Unchanged from before. */
  caption: string;
  /**
   * The §10 Level-2 line shown on a phone while collapsed — real numbers, so
   * the section is worth opening or safely skipped without opening it.
   */
  summary?: string;
  /** Preserves a caller's original section spacing, so desktop is untouched. */
  sectionClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <section className={sectionClassName ?? 'flex flex-col gap-3'}>
      <div className="hidden flex-col gap-1 md:flex">
        <h2 className="text-base font-medium tracking-tight">{title}</h2>
        <p className="text-xs text-[color:var(--text-muted)]">{caption}</p>
      </div>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={contentId}
        className="-my-1 flex w-full items-center justify-between gap-3 py-1 text-left md:hidden"
      >
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold tracking-[-0.01em]">
            {title}
          </span>
          <span className="mt-0.5 block text-[13px] leading-snug text-[color:var(--text-muted)]">
            {open ? caption : summary ?? caption}
          </span>
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
        className={cn('evidence-section-content', open && 'is-open')}
      >
        {children}
      </div>
    </section>
  );
}
