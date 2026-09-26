'use client';

import { NETWORK_LABEL } from '@/lib/network/presentation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useState } from 'react';

import { cn } from '@/lib/ui/cn';
import { ConnectWallet } from './ConnectWallet';
import { ThemeToggle } from './ThemeToggle';
import { Wordmark } from '@/components/brand/Logo';
import { useDismissibleLayer } from '@/lib/ui/useDismissibleLayer';
import { InstallPokter } from '@/components/pwa/InstallPokter';
import { usePwaInstall } from '@/components/pwa/PwaProvider';

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

const MOBILE_PRIMARY = PRIMARY.filter((item) =>
  ['/discover', '/agents', '/compare', '/my-agents'].includes(item.href),
);
const MOBILE_MORE = PRIMARY.filter((item) =>
  ['/leaderboard', '/pool-check'].includes(item.href),
);
const INSTALLED_PRIMARY = [
  { href: '/app', label: 'Home' },
  { href: '/discover', label: 'Discover' },
  { href: '/agents', label: 'Agents' },
  { href: '/my-agents', label: 'Activity' },
];

function MobileNavIcon({ href }: { href: string }) {
  const common = 'size-[18px] fill-none stroke-current';
  if (href === '/app') return <svg viewBox="0 0 24 24" aria-hidden className={common} strokeWidth="1.8"><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></svg>;
  if (href === '/discover') return <svg viewBox="0 0 24 24" aria-hidden className={common} strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5M11 8v6M8 11h6" /></svg>;
  if (href === '/agents') return <svg viewBox="0 0 24 24" aria-hidden className={common} strokeWidth="1.8"><rect x="4" y="6" width="16" height="13" rx="4" /><path d="M9 11h.01M15 11h.01M9 15h6M12 6V3" /></svg>;
  if (href === '/compare') return <svg viewBox="0 0 24 24" aria-hidden className={common} strokeWidth="1.8"><path d="M8 4v16M16 4v16M4 8h8M12 16h8" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden className={common} strokeWidth="1.8"><path d="M4 19V9M10 19V5M16 19v-7M22 19V2" /></svg>;
}

function MoreIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden className="size-[18px] fill-current"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>;
}

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
            <span className="hidden xl:inline">Agents: BSC mainnet · </span>
            <span className="hidden sm:inline">Hiring: </span>
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
  const { installed } = usePwaInstall();
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const layerRef = useDismissibleLayer<HTMLElement>({
    open: moreOpen,
    onDismiss: closeMore,
  });
  const moreActive = MOBILE_MORE.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  const primaryItems = installed ? INSTALLED_PRIMARY : MOBILE_PRIMARY;

  return (
    <nav
      ref={layerRef}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--border)] bg-[color:var(--bg)]/95 backdrop-blur-md md:hidden"
      aria-label="Primary navigation"
    >
      {moreOpen && (
        <div
          id="mobile-more-menu"
          className="absolute bottom-full right-3 mb-2 w-52 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] p-1.5 shadow-xl"
        >
          {MOBILE_MORE.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMore}
                className={cn(
                  'flex min-h-11 items-center justify-between rounded-[var(--radius)] px-3 text-sm transition-colors',
                  active
                    ? 'bg-[color:var(--brand-highlight-soft)] text-[color:var(--text)]'
                    : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]',
                )}
              >
                {item.label}
                <span aria-hidden>→</span>
              </Link>
            );
          })}
          <InstallPokter onComplete={closeMore} />
        </div>
      )}

      <div className="grid grid-cols-5 items-stretch">
        {primaryItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeMore}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[10px] transition-colors',
                active
                  ? 'text-[color:var(--text)]'
                  : 'text-[color:var(--text-muted)]',
              )}
            >
              <MobileNavIcon href={item.href} />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          className={cn(
            'flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[10px] transition-colors',
            moreOpen || moreActive
              ? 'text-[color:var(--text)]'
              : 'text-[color:var(--text-muted)]',
          )}
        >
          <MoreIcon />
          More
        </button>
      </div>
    </nav>
  );
}
