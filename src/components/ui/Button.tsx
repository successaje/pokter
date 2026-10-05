import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'positive' | 'danger' | 'caution';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-hover',
  secondary: 'border border-line-strong bg-transparent text-ink hover:bg-surface-hover',
  ghost: 'bg-transparent text-ink-secondary hover:bg-surface-hover hover:text-ink',
  positive: 'bg-positive text-canvas hover:opacity-90',
  danger: 'border border-negative/45 bg-transparent text-negative hover:bg-negative-dim',
  caution: 'border border-caution/45 bg-caution-dim text-caution hover:border-caution',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-meta',
  md: 'min-h-11 px-4 text-body-s',
  lg: 'min-h-12 px-5 text-body-s',
};

const BASE =
  'tap inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner in place of the label and holds the width. */
  loading?: boolean;
  /** Stretches to its container. */
  block?: boolean;
  className?: string;
  children: ReactNode;
};

type AsButton = Common & Omit<ComponentProps<'button'>, 'className' | 'children'> & { href?: undefined };
type AsLink = Common & Omit<ComponentProps<typeof Link>, 'className' | 'children'> & { href: string };

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 animate-spin fill-none stroke-current" strokeWidth="2.5">
      <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The one button.
 *
 * Six treatments, three sizes, and a link form for the many places a call
 * to action is navigation. `loading` keeps the label in the layout so the
 * control does not shrink while it waits; the label is still read to
 * assistive technology, with `aria-busy` saying why it is not responding.
 */
export function Button(props: AsButton | AsLink) {
  const { variant = 'secondary', size = 'md', loading = false, block = false, className, children, ...rest } = props;
  const classes = cn(BASE, VARIANT[variant], SIZE[size], block && 'w-full', className);

  if ('href' in rest && typeof rest.href === 'string') {
    const { href, ...link } = rest as AsLink;
    return (
      <Link href={href} className={classes} {...link}>
        {children}
      </Link>
    );
  }

  const { type = 'button', disabled, ...button } = rest as AsButton;
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={classes} {...button}>
      {loading && <Spinner />}
      <span className={cn(loading && 'opacity-70')}>{children}</span>
    </button>
  );
}
