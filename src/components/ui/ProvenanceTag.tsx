'use client';

import { useCallback, useState, useId } from 'react';

import { cn } from '@/lib/ui/cn';
import { useDismissibleLayer } from '@/lib/ui/useDismissibleLayer';

/**
 * §54. Where a number came from.
 *
 * Every externally sourced figure carries one of these. The point is not
 * decoration: a user should be able to reach the transaction or the methodology
 * behind any number without leaving the page, and a number with no traceable
 * source should visibly say so.
 */
export type Provenance =
  | 'onchain'
  | 'attested'
  | 'measured'
  | 'calculated'
  | 'estimated'
  | 'historical';

const LABELS: Record<Provenance, { label: string; className: string }> = {
  onchain: { label: 'Onchain', className: 'text-[color:var(--info)]' },
  attested: { label: 'Attested', className: 'text-[color:var(--positive)]' },
  measured: { label: 'Pokter measured', className: 'text-[color:var(--text-secondary)]' },
  /*
   * Derived arithmetic over figures we measured, which is neither a
   * measurement nor an estimate. Score coverage is the case this exists for:
   * calling it "historical" said the wrong thing about how it was produced,
   * and calling it "measured" would claim we observed it directly.
   */
  calculated: { label: 'Calculated', className: 'text-[color:var(--text-muted)]' },
  estimated: { label: 'Estimated', className: 'text-[color:var(--caution)]' },
  historical: { label: 'Historical', className: 'text-[color:var(--text-muted)]' },
};

export interface ProvenanceDetail {
  label: string;
  value: string;
  /** Renders the value as an external link when set. */
  href?: string;
}

export function ProvenanceTag({
  kind,
  details,
  note,
  className,
}: {
  kind: Provenance;
  details: ProvenanceDetail[];
  /** Extra context shown above the details, e.g. the measurement methodology. */
  note?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const layerRef = useDismissibleLayer<HTMLSpanElement>({
    open,
    onDismiss: close,
  });
  const panelId = useId();
  const meta = LABELS[kind];

  return (
    <span ref={layerRef} className={cn('relative inline-flex max-w-full', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        /*
         * `tap-safe` grows the hit area to 44px on phones without changing
         * the chip's size, so it stays legible inline in a sentence while
         * still being tappable.
         */
        className={cn(
          'tap-safe inline-flex items-center gap-1 rounded text-[10px] font-medium uppercase tracking-wide transition-opacity hover:opacity-100',
          open ? 'opacity-100' : 'opacity-70',
          meta.className,
        )}
      >
        <span aria-hidden className="size-1 rounded-full bg-current" />
        {meta.label}
      </button>

      {open && (
        <span
          id={panelId}
          role="dialog"
          className="absolute right-0 top-full z-20 mt-2 w-[min(18rem,calc(100vw-2.5rem))] max-w-[calc(100vw-2.5rem)] rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] p-3 text-left shadow-xl"
        >
          {note && (
            <span className="mb-2 block break-words text-[11px] leading-relaxed text-[color:var(--text-secondary)] [overflow-wrap:anywhere]">
              {note}
            </span>
          )}
          <span className="flex flex-col gap-1.5">
            {details.map((detail) => (
              <span
                key={detail.label}
                className="flex min-w-0 items-baseline justify-between gap-3 text-[11px]"
              >
                <span className="shrink-0 text-[color:var(--text-muted)]">
                  {detail.label}
                </span>
                {detail.href ? (
                  <a
                    href={detail.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mono min-w-0 break-all text-right text-[color:var(--info)] underline decoration-dotted underline-offset-2"
                  >
                    {detail.value}
                  </a>
                ) : (
                  <span className="mono min-w-0 break-all text-right text-[color:var(--text)]">
                    {detail.value}
                  </span>
                )}
              </span>
            ))}
          </span>
        </span>
      )}
    </span>
  );
}
