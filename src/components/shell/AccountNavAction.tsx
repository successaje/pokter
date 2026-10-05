'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/ui/cn';

/**
 * The way to your own account, in the bar rather than behind a menu.
 *
 * /account was reachable from the overflow menu and from nowhere else, so
 * the page holding somebody's own identity, wallets and published work was
 * the hardest thing in the product to find. The wallet button beside this
 * one is not a substitute: it opens a panel about a connection, which is a
 * different question from "where is my stuff".
 *
 * It sits next to Saved because the two belong to the same category — the
 * parts of Pokter that are yours rather than the catalogue's.
 */
export function AccountNavAction() {
  const pathname = usePathname();
  const active = pathname === '/account' || pathname.startsWith('/account/');

  return (
    <Link
      href="/account"
      aria-label="Your account"
      aria-current={active ? 'page' : undefined}
      /*
        No `.tap` here, deliberately. That utility sets a display on links
        inside the narrow-screen media query, which is exactly where `hidden`
        has to win — adding it makes this icon appear on phones, where the
        account already has a row in the tab bar's More menu and the header
        has no room for it. The hit target is moot for the same reason: this
        only ever renders at sm and up.
      */
      className={cn(
        'hidden size-9 items-center justify-center rounded-full border transition-colors sm:flex',
        active
          ? 'border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] text-[color:var(--text)]'
          : 'border-[color:var(--border)] text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]',
      )}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="size-4 fill-none stroke-current"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <circle cx="12" cy="8.5" r="3.6" />
        <path d="M5 19.2a7.2 7.2 0 0 1 14 0" />
      </svg>
    </Link>
  );
}
