import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

/**
 * Form controls with one height, one border and one focus treatment.
 *
 * `Field` owns the label, the hint and the error so a control can never ship
 * with a placeholder as its only name. Hint and error are wired to the
 * control through `aria-describedby`; an error is announced as it appears.
 */
const CONTROL =
  'w-full rounded-md border border-line-strong bg-canvas text-ink outline-none transition-colors placeholder:text-ink-faint focus-visible:border-line-focus disabled:opacity-60';

export function Field({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  /** The control. Give it `id` and `aria-describedby={describedBy(id)}`. */
  children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-body-s font-medium">
        {label}
        {required && (
          <span aria-hidden className="ml-1 text-ink-faint">
            *
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-meta text-ink-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-meta text-negative">
          {error}
        </p>
      )}
    </div>
  );
}

/** The `aria-describedby` value for a control inside a Field with a hint and/or an error. */
export function describedBy(id: string, { hint = true, error = false }: { hint?: boolean; error?: boolean } = {}): string | undefined {
  const ids = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cn(CONTROL, 'h-11 px-3 text-[14px]', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cn(CONTROL, 'min-h-28 p-3 text-[14px] leading-relaxed', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <select className={cn(CONTROL, 'h-11 px-3 pr-8 text-[14px]', className)} {...rest}>
      {children}
    </select>
  );
}

/**
 * A checkbox with its label as one tap target. The label is the accessible
 * name; the box is never offered on its own.
 */
export function Checkbox({
  label,
  className,
  ...rest
}: Omit<ComponentProps<'input'>, 'type'> & { label: ReactNode }) {
  return (
    <label className={cn('flex min-h-9 cursor-pointer items-start gap-2.5 text-body-s leading-relaxed text-ink-secondary', className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand" {...rest} />
      <span>{label}</span>
    </label>
  );
}
