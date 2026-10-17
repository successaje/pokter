'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { IS_TESTNET, MAINNET_ESCROW } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { Wordmark } from './Logo';
import { PRIMARY_NAV } from './nav';
import { ThemeSegmented, ThemeToggle } from './ThemeControl';
import { LazyHeaderWallet } from './wallet/LazyHeaderWallet';


function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The public header. Four destinations, the account control, and nothing
 * else. It tightens and takes a hairline once the page scrolls, so the hero
 * gets the full height and the working page gets a clear edge.
 */
export function SiteHeader() {
  const pathname = usePathname() ?? '/';
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <header
        className={cn(
          'sticky top-0 z-40 transition-[background-color,border-color,height] duration-300 ease-out',
          scrolled ? 'border-b border-rule bg-[color-mix(in_oklab,var(--paper)_88%,transparent)] backdrop-blur-md' : 'border-b border-transparent bg-paper',
        )}
      >
        <div className={cn('frame flex items-center gap-6 transition-[height] duration-300 ease-out', scrolled ? 'h-14' : 'h-16')}>
          <Wordmark />
          {/*
            Shown only while every hire really is test money.

            This badge said "Testnet", with a tooltip claiming escrow
            runs on testnet with test tokens, in the most prominent text
            on the site — and it kept saying it after mainnet escrow was
            enabled and a hire settled in real $U. A global claim cannot
            be true when hires settle on whichever chain the agent's
            signed price names, so it is made only when it holds, and
            each price now carries its own currency beside it.
          */}
          {IS_TESTNET && !MAINNET_ESCROW && (
            <span className="hidden rounded-full border border-rule-strong px-2 py-0.5 text-[11px] font-medium text-ink-3 sm:inline" title="Escrow runs on BNB Smart Chain testnet with test tokens">
              Testnet
            </span>
          )}

          <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 md:flex">
            {PRIMARY_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                className={cn(
                  'rounded-[8px] px-3 py-2 text-sm font-medium transition-colors',
                  isActive(pathname, item.href) ? 'text-ink' : 'text-ink-3 hover:text-ink',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle className="hidden md:grid" />
            <Link href="/workspace" className="hidden rounded-[8px] px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink lg:inline-flex">
              Workspace
            </Link>
            {/*
              The free trial, beside the wallet rather than in the hero.
              It is the one way to watch an agent work before any wallet
              opens, and it was reachable only by starting a hire and
              noticing the second option — so it belongs where the decision
              to connect is made.

              Offered only while a paid hire is also possible: with testnet
              the only escrow, every hire is already free and "try free"
              would distinguish nothing. Hidden below md, where it moves
              into the menu instead of crowding the wallet.

              It goes to the catalogue, not `?chain=97` — that filter means
              "registered on", and treating it as the settlement network is
              the conflation that made 58 mainnet agents read as testnet.
            */}
            {MAINNET_ESCROW && (
              <Link
                href="/discover"
                className="hidden rounded-[8px] px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink md:inline-flex"
                title="Pokter's delivery agent carries your task to the agent and returns its answer, in test tokens, at no cost"
              >
                Try free on testnet
              </Link>
            )}
            <LazyHeaderWallet />
            <button
              type="button"
              onClick={() => setMenu(true)}
              className="grid size-10 place-items-center rounded-[8px] text-ink md:hidden"
              aria-label="Open menu"
              aria-expanded={menu}
            >
              <Icon.Menu size={20} />
            </button>
          </div>
        </div>
      </header>

      <Sheet open={menu} onClose={() => setMenu(false)} variant="drawer" title="Menu">
        <div onClick={(e) => (e.target as HTMLElement).closest('a') && setMenu(false)}>
        <nav aria-label="Mobile" className="flex flex-col">
          {[{ href: '/', label: 'Home' }, ...PRIMARY_NAV].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn('flex items-center justify-between border-b border-rule py-4 text-lg font-medium', isActive(pathname, item.href) && item.href !== '/' ? 'text-ink' : 'text-ink-2')}
            >
              {item.label}
              <Icon.ChevronRight className="text-ink-3" />
            </Link>
          ))}
        </nav>
        {MAINNET_ESCROW && (
          <Link href="/discover" className="mt-6 flex items-center justify-between rounded-[10px] border border-rule px-3 py-3 text-[15px] font-medium text-ink-2">
            <span className="flex flex-col gap-0.5">
              Try free on testnet
              <span className="text-[12.5px] font-normal text-ink-3">Test tokens, no cost. Pokter&rsquo;s delivery agent carries the task.</span>
            </span>
            <Icon.ChevronRight className="shrink-0 text-ink-3" />
          </Link>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <span className="t-label">Your space</span>
          {[
            { href: '/workspace', label: 'Workspace', icon: <Icon.Briefcase size={16} /> },
            { href: '/studio', label: 'Builder Studio', icon: <Icon.Layers size={16} /> },
            { href: '/account', label: 'Account', icon: <Icon.User size={16} /> },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="flex items-center gap-3 py-2 text-[15px] text-ink-2">
              <span className="text-ink-3">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-2">
          <span className="t-label">Appearance</span>
          <ThemeSegmented />
        </div>
        </div>
      </Sheet>
    </>
  );
}
