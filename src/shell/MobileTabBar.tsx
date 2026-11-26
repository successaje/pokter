'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { openScout } from '@/features/scout/open';
import { cn } from '@/lib/ui/cn';
import { Icon } from '@/ui/icons';

const TABS = [
  { href: '/', label: 'Home', icon: Icon.Home, match: (p: string) => p === '/' },
  { href: '/discover', label: 'Discover', icon: Icon.Compass, match: (p: string) => p.startsWith('/discover') || p.startsWith('/agents') || p.startsWith('/compare') },
  { href: '/workspace', label: 'Workspace', icon: Icon.Briefcase, match: (p: string) => p.startsWith('/workspace') || (p.startsWith('/build') && !p.startsWith('/build/integration')) },
  { href: '/account', label: 'Account', icon: Icon.User, match: (p: string) => p.startsWith('/account') },
];

/**
 * The phone's primary navigation: four destinations at the thumb, and Scout
 * between them. Builder Studio lives under Account on phones, because
 * building is a desk task and checking on a hire is not.
 *
 * Scout is a tab here rather than the bubble it is on a wider screen: a
 * bubble floating over a phone's page sits on this bar and on whatever the
 * page put at the bottom. It opens the chat over the page instead of going
 * anywhere, so it is a button, never `aria-current`.
 */
export function MobileTabBar() {
  const pathname = usePathname() ?? '/';
  const tab = ({ href, label, icon: Glyph, match }: (typeof TABS)[number]) => {
    const active = match(pathname);
    return (
      <li key={href}>
        <Link
          href={href}
          aria-current={active ? 'page' : undefined}
          className={cn('flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-ink' : 'text-ink-3')}
        >
          <span className="relative">
            <Glyph size={20} />
            {active && <span className="absolute -bottom-1.5 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-signal" aria-hidden />}
          </span>
          {label}
        </Link>
      </li>
    );
  };
  return (
    <nav
      aria-label="App"
      className="mobile-tab-bar pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-[color-mix(in_oklab,var(--raised)_92%,transparent)] backdrop-blur-md md:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.slice(0, 2).map(tab)}
        <li>
          <button type="button" onClick={() => openScout()} className="flex h-14 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-3">
            <Icon.Scout size={20} />
            Scout
          </button>
        </li>
        {TABS.slice(2).map(tab)}
      </ul>
    </nav>
  );
}
