import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

/*
 * Four intents and three sizes, nothing else.
 *
 *   primary   ink on paper: the one action a screen exists for
 *   signal    yellow: reserved for the irreversible money step (fund, hire)
 *   secondary hairline outline: the alternative
 *   ghost     text with a hover wash: tertiary and toolbar actions
 *   danger    for dispute and destructive confirmations
 */
export type ButtonIntent = 'primary' | 'signal' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 's' | 'm' | 'l';

const INTENT: Record<ButtonIntent, string> = {
  primary:
    'bg-ink text-paper hover:bg-[color-mix(in_oklab,var(--ink)_86%,var(--paper))] active:translate-y-px disabled:bg-ink/40',
  signal:
    'bg-signal text-signal-ink hover:bg-[color-mix(in_oklab,var(--signal)_88%,black)] active:translate-y-px disabled:opacity-50',
  secondary:
    'bg-raised text-ink border border-rule-strong hover:border-ink hover:bg-raised active:translate-y-px disabled:opacity-50',
  ghost: 'text-ink-2 hover:text-ink hover:bg-sunken disabled:opacity-40',
  danger: 'bg-bad text-paper hover:brightness-110 active:translate-y-px disabled:opacity-50',
};

const SIZE: Record<ButtonSize, string> = {
  s: 'h-8 px-3 text-[13px] gap-1.5 rounded-[7px]',
  m: 'h-10 px-4 text-sm gap-2 rounded-[9px]',
  l: 'h-12 px-5 text-[15px] gap-2.5 rounded-[11px]',
};

export function buttonClass(intent: ButtonIntent = 'primary', size: ButtonSize = 'm', extra?: string) {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium leading-none tracking-[-0.005em] transition-[background-color,border-color,color,transform,opacity] duration-150 ease-out',
    INTENT[intent],
    SIZE[size],
    extra,
  );
}

type Common = { intent?: ButtonIntent; size?: ButtonSize; busy?: boolean; icon?: ReactNode; trailing?: ReactNode };

export function Button({
  intent,
  size,
  busy,
  icon,
  trailing,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: Common & ComponentProps<'button'>) {
  return (
    <button
      type={type}
      className={buttonClass(intent, size, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <Spinner /> : icon}
      {children}
      {trailing}
    </button>
  );
}

export function LinkButton({
  intent,
  size,
  icon,
  trailing,
  className,
  children,
  ...rest
}: Common & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass(intent, size, className)} {...rest}>
      {icon}
      {children}
      {trailing}
    </Link>
  );
}

/** A small arc that turns. Used inside buttons and inline status only. */
export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={cn('animate-spin', className)}
      aria-hidden
    >
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.75" />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
