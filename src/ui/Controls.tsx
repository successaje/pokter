'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

/** A segmented control: mutually exclusive options that switch a view. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'm',
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; count?: number }>;
  label: string;
  size?: 's' | 'm';
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-[10px] bg-sunken p-[3px]', className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium transition-[background-color,color,box-shadow] duration-150',
              size === 's' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3 text-[13px]',
              selected ? 'bg-raised text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-ink-3 hover:text-ink',
            )}
          >
            {option.label}
            {option.count !== undefined && <span className="t-readout text-[11px] text-ink-3">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Page-level tabs as links, so each tab is a URL that can be shared and the
 * back button works. Underlined, not boxed.
 */
export function TabLinks({
  tabs,
  active,
  label,
  className,
}: {
  tabs: Array<{ href: string; label: ReactNode; id: string; count?: number }>;
  active: string;
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn('no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      <ul className="flex min-w-max gap-6 border-b border-rule">
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                scroll={false}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'relative -mb-px flex h-11 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors',
                  selected ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink',
                )}
              >
                {tab.label}
                {tab.count !== undefined && <span className="t-readout text-[11px] text-ink-3">{tab.count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Button-driven tabs for in-page panels. */
export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: Array<{ value: T; label: ReactNode; count?: number }>;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('no-scrollbar flex gap-6 overflow-x-auto border-b border-rule', className)}>
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={cn(
              '-mb-px flex h-11 shrink-0 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors',
              selected ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink',
            )}
          >
            {tab.label}
            {tab.count !== undefined && <span className="t-readout text-[11px] text-ink-3">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A removable filter token. */
export function Chip({
  children,
  selected,
  onClick,
  href,
  className,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const cls = cn(
    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
    selected ? 'border-ink bg-ink text-paper' : 'border-rule-strong bg-raised text-ink-2 hover:border-ink hover:text-ink',
    className,
  );
  if (href) {
    return (
      <Link href={href} scroll={false} className={cls} aria-current={selected ? 'true' : undefined}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} aria-pressed={selected}>
      {children}
    </button>
  );
}

export function Breadcrumbs({ items, className }: { items: Array<{ href?: string; label: ReactNode }>; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('text-[13px]', className)}>
      <ol className="flex flex-wrap items-center gap-1.5 text-ink-3">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-1.5">
            {index > 0 && <span aria-hidden>/</span>}
            {item.href ? (
              <Link href={item.href} className="hover:text-ink">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink-2">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
