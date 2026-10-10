'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { IS_TESTNET, NETWORK_LABEL } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { Icon } from '@/ui/icons';
import { Wordmark } from './Logo';
import { MobileTabBar } from './MobileTabBar';
import { ThemeToggle } from './ThemeControl';
import { AccountButton } from './wallet/AccountButton';

type NavItem = { href: string; label: string; icon: ReactNode; exact?: boolean };

const WORKSPACE: NavItem[] = [
  { href: '/workspace', label: 'Overview', icon: <Icon.Home size={17} />, exact: true },
  { href: '/workspace/jobs', label: 'Jobs', icon: <Icon.Briefcase size={17} /> },
  { href: '/workspace/agents', label: 'Hired agents', icon: <Icon.Grid size={17} /> },
  { href: '/workspace/inbox', label: 'Inbox', icon: <Icon.Inbox size={17} /> },
  { href: '/workspace/saved', label: 'Saved', icon: <Icon.Bookmark size={17} /> },
  { href: '/workspace/wallet', label: 'Wallet', icon: <Icon.Wallet size={17} /> },
];

const STUDIO: NavItem[] = [
  { href: '/studio', label: 'Studio home', icon: <Icon.Layers size={17} />, exact: true },
  { href: '/studio/new', label: 'Create an agent', icon: <Icon.Plus size={17} /> },
  { href: '/studio/import', label: 'Connect existing', icon: <Icon.Plug size={17} /> },
  { href: '/studio/templates', label: 'Templates', icon: <Icon.Doc size={17} /> },
];

function active(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * The working shell for Workspace, Studio and Account: a quiet sidebar with
 * a two-way context switch at the top, so a person who both hires and builds
 * moves between the two without a second account or a second app.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/workspace';
  const context: 'workspace' | 'studio' | 'account' = pathname.startsWith('/studio')
    ? 'studio'
    : pathname.startsWith('/account')
      ? 'account'
      : 'workspace';
  const items = context === 'studio' ? STUDIO : WORKSPACE;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-rule bg-raised/60 md:flex">
        <div className="flex h-16 items-center px-5">
          <Wordmark />
        </div>

        <div className="px-3">
          <div role="tablist" aria-label="Context" className="grid grid-cols-2 rounded-[10px] bg-sunken p-[3px] text-[13px] font-medium">
            {[
              { id: 'workspace', href: '/workspace', label: 'Workspace' },
              { id: 'studio', href: '/studio', label: 'Studio' },
            ].map((tab) => (
              <Link
                key={tab.id}
                href={tab.href}
                role="tab"
                aria-selected={context === tab.id}
                className={cn(
                  'flex h-8 items-center justify-center rounded-[7px] transition-colors',
                  context === tab.id ? 'bg-raised text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-ink-3 hover:text-ink',
                )}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>

        <nav aria-label={context === 'studio' ? 'Studio' : 'Workspace'} className="mt-4 flex flex-col gap-0.5 px-3">
          {items.map((item) => {
            const on = active(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'flex h-9 items-center gap-3 rounded-[8px] px-3 text-sm font-medium transition-colors',
                  on ? 'bg-sunken text-ink' : 'text-ink-3 hover:bg-sunken/70 hover:text-ink',
                )}
              >
                <span className={on ? 'text-ink' : 'text-ink-3'}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 flex flex-col gap-0.5 border-t border-rule px-3 pt-4">
          <Link href="/discover" className="flex h-9 items-center gap-3 rounded-[8px] px-3 text-sm font-medium text-ink-3 hover:bg-sunken/70 hover:text-ink">
            <Icon.Compass size={17} />
            Discover agents
          </Link>
          <Link
            href="/account"
            aria-current={context === 'account' ? 'page' : undefined}
            className={cn(
              'flex h-9 items-center gap-3 rounded-[8px] px-3 text-sm font-medium',
              context === 'account' ? 'bg-sunken text-ink' : 'text-ink-3 hover:bg-sunken/70 hover:text-ink',
            )}
          >
            <Icon.Gear size={17} />
            Account
          </Link>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-rule px-4 py-3">
          <span className="flex items-center gap-2 text-[12px] text-ink-3">
            <span className="size-1.5 rounded-full bg-signal" aria-hidden />
            {NETWORK_LABEL}
            {IS_TESTNET && ' · test'}
          </span>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-rule bg-[color-mix(in_oklab,var(--paper)_90%,transparent)] px-4 backdrop-blur-md md:h-16 md:justify-end md:px-8">
          <div className="md:hidden">
            <Wordmark />
          </div>
          <div className="flex items-center gap-2">
            <Link href="/discover" className="hidden items-center gap-2 rounded-[8px] px-3 py-2 text-sm text-ink-3 hover:text-ink lg:inline-flex">
              <Icon.Search size={16} /> Find an agent
            </Link>
            <AccountButton />
          </div>
        </header>
        {(context === 'workspace' || context === 'studio') && (
          <nav aria-label="Section" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-rule px-4 py-2 md:hidden">
            {[
              ...(context === 'studio'
                ? STUDIO
                : WORKSPACE),
            ].map((item) => {
              const on = active(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={on ? 'page' : undefined}
                  className={cn('shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium', on ? 'bg-ink text-paper' : 'text-ink-3')}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
        <main id="main" className="flex-1 px-4 pb-28 pt-6 sm:px-6 md:px-8 md:pb-16 md:pt-8">
          <div className="mx-auto w-full max-w-[1080px]">{children}</div>
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
