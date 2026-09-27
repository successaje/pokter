'use client';

import { useCallback, useEffect, useId, useRef } from 'react';

import { cn } from '@/lib/ui/cn';

/**
 * A modal bottom sheet for phone-width disclosure.
 *
 * Deliberately not built on `useDismissibleLayer`: that hook encodes a
 * *non-modal* contract, where the page behind stays interactive and an outside
 * press dismisses. A sheet that can hold permission and money detail has to be
 * modal — focus trapped inside it, the page behind inert and unscrollable —
 * so the two cannot share an implementation without one of them lying about
 * what it is.
 */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional supporting line, announced with the title. */
  description?: string;
  children: React.ReactNode;
  /** Pinned below the scrolling body, for a primary action. */
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const close = useCallback(() => onClose(), [onClose]);

  /* Remember the trigger before focus moves, and give it back on close. */
  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    return () => restoreTo.current?.focus?.();
  }, [open]);

  /*
   * Lock the page behind. Without this the body scrolls under the sheet on
   * iOS whenever the sheet's own content is not scrollable.
   */
  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  /* Move focus in, then keep Tab inside for as long as the sheet is open. */
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    /*
     * Not `?.focus() ?? panel.focus()`: focus() returns undefined on success
     * too, so the fallback would always fire and land focus on the panel.
     */
    const firstItem = panel.querySelector<HTMLElement>(FOCUSABLE);
    if (firstItem) firstItem.focus();
    else panel.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (item) => item.offsetParent !== null,
      );
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/*
        Presentational: the accessible way out is Escape and the labelled
        close button, both of which work without a pointer.
      */}
      <div
        className="sheet-backdrop absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={close}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'sheet-panel relative flex max-h-[88svh] w-full max-w-[560px] flex-col',
          'rounded-t-[1.25rem] border border-b-0 border-[color:var(--border-strong)]',
          'bg-[color:var(--surface)] shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.6)]',
          'sm:mb-4 sm:rounded-b-[1.25rem] sm:border-b',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--border)] px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold tracking-[-0.01em]">
              {title}
            </h2>
            {description && (
              <p
                id={descriptionId}
                className="mt-1 text-[13px] leading-relaxed text-[color:var(--text-muted)]"
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-1.5 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-[18px] fill-none stroke-current" strokeWidth="1.8">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>

        {footer && (
          <div
            className="border-t border-[color:var(--border)] px-5 pt-3"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
