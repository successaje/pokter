'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/ui/cn';
import { ConnectWallet } from './ConnectWallet';
import { ThemeToggle } from './ThemeToggle';

/**
 * §11. Primary navigation.
 *
 * Ordered along the product loop — discover, then compare, then act — so the
 * nav itself teaches the journey. Browsing never requires a wallet (§59), so
 * Connect sits apart from the primary items rather than gating them.
 */
const PRIMARY = [
  { href: '/discover', label: 'Discover' },
  { href: '/agents', label: 'Agents' },
  { href: '/compare', label: 'Compare' },
  { href: '/leaderboard', label: 'Rankings' },
  { href: '/my-agents', label: 'My agents' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:var(--bg)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-5 sm:px-8">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-[color:var(--text)]"
        >
          Pokter
        </Link>

        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {PRIMARY.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-[var(--radius)] px-2.5 py-1.5 text-[13px] transition-colors',
                  active
                    ? 'bg-[color:var(--surface-raised)] text-[color:var(--text)]'
                    : 'text-[color:var(--text-muted)] hover:text-[color:var(--text)]',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="mono hidden rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[10px] text-[color:var(--text-muted)] sm:inline">
            BSC · 56
          </span>
          <ThemeToggle />
          <ConnectWallet />
        </div>
      </div>
    </header>
  );
}

/** §11. Mobile bottom navigation. */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--border)] bg-[color:var(--bg)]/95 backdrop-blur-md md:hidden">
      <div className="flex items-stretch">
        {PRIMARY.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] transition-colors',
                active
                  ? 'text-[color:var(--text)]'
                  : 'text-[color:var(--text-muted)]',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'size-1 rounded-full',
                  active ? 'bg-[color:var(--info)]' : 'bg-transparent',
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
