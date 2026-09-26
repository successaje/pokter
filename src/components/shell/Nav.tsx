'use client';

import { NETWORK_LABEL } from '@/lib/network/presentation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/ui/cn';
import { ConnectWallet } from './ConnectWallet';
import { ThemeToggle } from './ThemeToggle';
import { Wordmark } from '@/components/brand/Logo';

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
  { href: '/pool-check', label: 'Pool check' },
  { href: '/my-agents', label: 'My agents' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:var(--bg)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-5 sm:px-8">
        <Link
          href="/"
          aria-label="Pokter home"
          className="text-[color:var(--text)] transition-opacity hover:opacity-80"
        >
          <Wordmark />
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center gap-1 whitespace-nowrap md:flex">
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
          {/*
            FE-03 and FE-05. This pill used to be hidden below 640px and to
            name chain 56 only — the registry. Phase 2 requires the network to
            be stated, and money moves on the escrow chain, so the escrow
            network is what leads and it is never hidden.

            Both are named because both are true: agents are read from the
            mainnet registry while transactions settle on the escrow chain,
            and showing one number alone is what made the header and the hire
            page appear to contradict each other.
          */}
          <span className="mono flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[10px] text-[color:var(--text-muted)]">
            <span className="size-1.5 shrink-0 rotate-45 bg-[color:var(--brand)]" aria-hidden />
            {/*
              The registry chain only once there is genuinely room. Showing it
              from 640px made the pill wrap and dragged every nav link onto a
              second line between roughly 768 and 1200px — the escrow network
              is the part that must always be legible, so it is the part that
              never moves.
            */}
            <span className="hidden xl:inline">Agents chain 56 · </span>
            {NETWORK_LABEL}
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
                  active ? 'bg-[color:var(--brand)]' : 'bg-transparent',
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
