'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { IS_TESTNET, MAINNET_ESCROW } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { HeaderMenus } from './HeaderMenus';
import { HeaderSearch } from './HeaderSearch';
import { Wordmark } from './Logo';
import { drawerGroups, isActive, NAV_DIRECT } from './nav';
import { ThemeSegmented, ThemeToggle } from './ThemeControl';
import { LazyHeaderWallet } from './wallet/LazyHeaderWallet';


/**
 * The site header, on every page including Hiring and Building. Two menus
 * and one link (Hire, Build, Proof; see `nav.ts`), search, the account
 * control, and nothing else; How it works is in the footer. It always has
 * its hairline, and tightens and blurs what is behind it once the page
 * scrolls.
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
          /* The rule is always drawn: hidden at the top of some pages and shown on others, it read as the header flickering. */
          'border-b border-rule',
          scrolled ? 'bg-[color-mix(in_oklab,var(--paper)_88%,transparent)] backdrop-blur-md' : 'bg-paper',
        )}
      >
        {/* A narrower gap on phones: with a wallet connected, 24px here was part of a 13px overflow at 375px. */}
        <div className={cn('frame flex items-center gap-3 transition-[height] duration-300 ease-out sm:gap-6', scrolled ? 'h-14' : 'h-16')}>
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

          <HeaderMenus />

          <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
            <ThemeToggle className="hidden lg:grid" />
            {/* Search, then the account. The workspace is in the account menu ("My workspace"), so it is no longer a third control here. */}
            <HeaderSearch />
            <LazyHeaderWallet />
            <button
              type="button"
              onClick={() => setMenu(true)}
              className="grid size-10 place-items-center rounded-[8px] text-ink lg:hidden"
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
          <Link href="/" className={cn('flex items-center justify-between border-b border-rule py-4 text-lg font-medium', pathname === '/' ? 'text-ink' : 'text-ink-2')}>
            Home
            <Icon.ChevronRight className="text-ink-3" />
          </Link>
          {/* Proof right under Home: one tap away here too, as it is one click on desktop. */}
          {NAV_DIRECT.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn('flex items-center justify-between border-b border-rule py-4 text-lg font-medium', isActive(pathname, item.href) ? 'text-ink' : 'text-ink-2')}
            >
              {item.label}
              <Icon.ChevronRight className="text-ink-3" />
            </Link>
          ))}
          {drawerGroups().map((group) => (
            <div key={group.label} className="mt-5">
              <span className="t-label">{group.label}</span>
              {group.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn('flex items-center justify-between border-b border-rule py-3 text-lg', isActive(pathname, link.href) ? 'text-ink' : 'text-ink-2')}
                >
                  {link.label}
                  <Icon.ChevronRight className="text-ink-3" />
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-6 flex flex-col gap-2">
          <span className="t-label">Your space</span>
          {[
            { href: '/workspace', label: 'My workspace', icon: <Icon.Briefcase size={16} /> },
            { href: '/account', label: 'Settings', icon: <Icon.Gear size={16} /> },
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
