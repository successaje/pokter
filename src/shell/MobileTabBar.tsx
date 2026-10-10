'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/ui/cn';
import { Icon } from '@/ui/icons';

const TABS = [
  { href: '/', label: 'Home', icon: Icon.Home, match: (p: string) => p === '/' },
  { href: '/discover', label: 'Discover', icon: Icon.Compass, match: (p: string) => p.startsWith('/discover') || p.startsWith('/agents') || p.startsWith('/compare') },
  { href: '/workspace', label: 'Activity', icon: Icon.Pulse, match: (p: string) => p.startsWith('/workspace') },
  { href: '/account', label: 'Account', icon: Icon.User, match: (p: string) => p.startsWith('/account') || p.startsWith('/studio') },
];

/**
 * The phone's primary navigation: four destinations at the thumb. Builder
 * Studio lives under Account on phones, because building is a desk task and
 * checking on a hire is not.
 */
export function MobileTabBar() {
  const pathname = usePathname() ?? '/';
  return (
    <nav
      aria-label="App"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-[color-mix(in_oklab,var(--raised)_92%,transparent)] backdrop-blur-md md:hidden"
    >
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Glyph = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn('flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-ink' : 'text-ink-3')}
              >
                <span className="relative">
                  <Glyph size={20} />
                  {active && <span className="absolute -bottom-1.5 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-signal" aria-hidden />}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
