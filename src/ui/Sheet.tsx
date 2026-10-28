'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';
import { Icon } from './icons';

/**
 * One overlay primitive on top of the native <dialog>: focus is trapped,
 * the page behind is inert, Escape closes it. On phones it is a bottom
 * sheet; from `sm` up it is either a centred dialog or a right-hand drawer.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  headerAction,
  icon,
  variant = 'dialog',
  className,
  labelledBy,
  floating = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Beside Close: a second way out, for sheets that have one. */
  headerAction?: ReactNode;
  /** Left of the title: what this sheet is about, usually a picture of it. */
  icon?: ReactNode;
  variant?: 'dialog' | 'drawer';
  className?: string;
  labelledBy?: string;
  /** A drawer held off the screen's edges, with rounded corners, rather than flush to them. */
  floating?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={labelledBy}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'pointer-events-none flex h-full w-full items-end',
          variant === 'dialog' ? 'sm:items-center sm:justify-center sm:p-6' : 'sm:items-stretch sm:justify-end',
          variant === 'drawer' && floating && 'sm:p-4',
        )}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          className={cn(
            'sheet-panel pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[18px] border border-rule bg-raised shadow-float',
            variant === 'dialog' ? 'sm:max-w-lg sm:rounded-[16px]' : 'sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:border-y-0 sm:border-r-0',
            variant === 'drawer' && floating && 'sm:rounded-[20px] sm:border sm:border-rule-strong',
            className,
          )}
        >
          {(title || description) && (
            <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                {icon}
                <div className="flex min-w-0 flex-col gap-0.5">
                  {title && <h2 className="t-h3 truncate">{title}</h2>}
                  {description && <p className="text-[13px] leading-snug text-ink-3">{description}</p>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
              {headerAction}
              <button
                type="button"
                onClick={onClose}
                className="-mr-1.5 -mt-1 grid size-9 shrink-0 place-items-center rounded-[8px] text-ink-3 hover:bg-sunken hover:text-ink"
                aria-label="Close"
              >
                <Icon.Close />
              </button>
              </div>
            </header>
          )}
          {/*
            Positioned, so anything absolutely placed inside (a screen-reader
            label, a tooltip) is laid out and clipped here. Unpositioned, such
            an element took the dialog as its frame, stretched it past the
            screen, and the whole panel scrolled away. Scrolling stops at its
            ends instead of carrying on to the page behind.
          */}
          <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
          {footer && <footer className="pb-safe border-t border-rule px-5 pt-3">{footer}</footer>}
        </div>
      </div>
    </dialog>
  );
}
