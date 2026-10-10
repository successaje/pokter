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
  variant = 'dialog',
  className,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'dialog' | 'drawer';
  className?: string;
  labelledBy?: string;
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
        )}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          className={cn(
            'sheet-panel pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[18px] border border-rule bg-raised shadow-float',
            variant === 'dialog' ? 'sm:max-w-lg sm:rounded-[16px]' : 'sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:border-y-0 sm:border-r-0',
            className,
          )}
        >
          {(title || description) && (
            <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
              <div className="flex min-w-0 flex-col gap-1">
                {title && <h2 className="t-h3">{title}</h2>}
                {description && <p className="text-[13px] leading-snug text-ink-3">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="-mr-1.5 -mt-1 grid size-9 shrink-0 place-items-center rounded-[8px] text-ink-3 hover:bg-sunken hover:text-ink"
                aria-label="Close"
              >
                <Icon.Close />
              </button>
            </header>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <footer className="pb-safe border-t border-rule px-5 pt-3">{footer}</footer>}
        </div>
      </div>
    </dialog>
  );
}
