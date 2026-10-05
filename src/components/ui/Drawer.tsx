'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

/**
 * A drawer on desktop, a bottom sheet on phones. One component, because the
 * content is the same and only the entrance differs.
 *
 * A native <dialog> opened modally: focus is trapped, the page behind is
 * inert, Escape closes, and a click on the backdrop closes. The body does
 * not scroll underneath.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  width = 'sm:max-w-[30rem]',
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Desktop width class. */
  width?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        'fixed inset-0 m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-[rgba(17,17,16,0.35)] backdrop:backdrop-blur-[1px]',
        'open:flex open:items-end open:justify-center sm:open:items-stretch sm:open:justify-end',
      )}
    >
      {open && (
        <div
          className={cn(
            'flex max-h-[92svh] w-full flex-col bg-surface text-ink shadow-[var(--shadow-overlay)]',
            'sheet-in rounded-t-lg sm:drawer-in sm:max-h-none sm:h-full sm:rounded-none sm:border-l sm:border-line',
            width,
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-title">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-0.5 text-body-s text-ink-muted">
                  {description}
                </p>
              )}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="tap-safe grid size-8 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink">
              <svg viewBox="0 0 20 20" aria-hidden className="size-4 fill-none stroke-current" strokeWidth="1.8">
                <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
