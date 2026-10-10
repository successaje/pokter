import type { ComponentProps, ReactNode } from 'react';
import { useId } from 'react';

import { cn } from '@/lib/ui/cn';

export const inputClass =
  'w-full rounded-[9px] border border-rule-strong bg-raised px-3 text-[15px] text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] duration-150 hover:border-ink-3 focus:border-ink focus:outline-none focus:ring-4 focus:ring-[color-mix(in_oklab,var(--signal)_30%,transparent)] disabled:opacity-60 aria-[invalid=true]:border-bad';

/**
 * Label, control, hint and error in one, wired for assistive tech: the hint
 * and error are referenced from the control, and the error is announced.
 */
export function Field({
  label,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-3 text-sm font-medium text-ink">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-ink-3">Optional</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="text-[13px] leading-snug text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-[13px] leading-snug text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cn(inputClass, 'h-11', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cn(inputClass, 'min-h-28 py-2.5 leading-relaxed', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select className={cn(inputClass, 'h-11 appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" width="14" height="14" viewBox="0 0 20 20" aria-hidden>
        <path d="m5.5 8 4.5 4.5L14.5 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function Checkbox({ label, description, className, ...rest }: Omit<ComponentProps<'input'>, 'type'> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 text-sm', className)}>
      <input type="checkbox" className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-[var(--ink)]" {...rest} />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium text-ink">{label}</span>
        {description && <span className="text-[13px] leading-snug text-ink-3">{description}</span>}
      </span>
    </label>
  );
}
