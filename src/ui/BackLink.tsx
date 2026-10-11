'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';

import { cn } from '@/lib/ui/cn';
import { NAV_DEPTH_KEY } from '@/shell/NavigationMemory';
import { Icon } from './icons';

/**
 * Back to where the reader came from, when that was a page on this site;
 * otherwise to `fallback`. A shared link opened cold has no page here to
 * return to, and browser history would take the reader off the site.
 */
export function BackLink({ fallback, label = 'Back', className }: { fallback: string; label?: string; className?: string }) {
  const router = useRouter();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    let visited = 0;
    try {
      visited = Number(window.sessionStorage.getItem(NAV_DEPTH_KEY) ?? '0');
    } catch {
      visited = 0;
    }
    // More than this page seen in this tab: there is a page on this site to go back to.
    if (visited > 1 && window.history.length > 1) {
      event.preventDefault();
      router.back();
    }
  };
  return (
    <Link href={fallback} onClick={onClick} className={cn('inline-flex items-center gap-1 self-start text-[13px] font-medium text-ink-2 hover:text-ink', className)}>
      <Icon.ChevronLeft size={15} />
      {label}
    </Link>
  );
}
