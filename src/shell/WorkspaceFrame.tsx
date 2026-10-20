'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';
import { Icon } from '@/ui/icons';

export type WorkspaceItem = { href: string; label: string; icon: ReactNode; exact?: boolean };

type Section = 'hiring' | 'building';

const VIEWS: Array<{ id: Section; href: string; label: string; icon: ReactNode }> = [
  { id: 'hiring', href: '/workspace', label: 'Hiring', icon: <Icon.Briefcase size={15} /> },
  { id: 'building', href: '/build', label: 'Building', icon: <Icon.Layers size={15} /> },
];

/* Open is remembered; folded to icons is the default, as the rail is drawn. */
const EXPANDED_KEY = 'pokter.workspace.expanded';

function isOn(pathname: string, item: WorkspaceItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Hiring and Building, laid out the same way under the site's own header.
 *
 * At the top left, a switch between the two: someone who builds may also
 * hire, and neither side is a role they chose. Under it, a floating rail
 * of where the work is — icons, a rule, then the references — which opens
 * to show its labels and remembers that on this device. Folded, each icon
 * names itself on hover and on keyboard focus, so nothing is reachable
 * only by guessing. The page takes the rest of the width.
 *
 * On a phone the switch stays at the top and the rail becomes a row of
 * links under it, because a drawer for six links is a step nobody needs.
 */
export function WorkspaceFrame({ section, items, more = [], children }: { section: Section; items: WorkspaceItem[]; more?: WorkspaceItem[]; children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const label = section === 'building' ? 'Building' : 'Hiring';
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(EXPANDED_KEY) === '1') setExpanded(true); // eslint-disable-line react-hooks/set-state-in-effect -- read once after hydration; the server cannot know it
    } catch {
      /* Storage blocked: the rail starts folded. */
    }
  }, []);
  const toggle = () => {
    setExpanded((was) => {
      try {
        window.localStorage.setItem(EXPANDED_KEY, was ? '0' : '1');
      } catch {
        /* Not remembered, still toggled. */
      }
      return !was;
    });
  };

  const switcher = (compact: boolean) => (
    <div role="tablist" aria-label="Workspace" className={cn('grid grid-cols-2 rounded-full border border-rule bg-raised p-1 text-[13px] font-medium shadow-sm', compact ? 'w-[60px]' : 'w-full')}>
      {VIEWS.map((view) => {
        const on = view.id === section;
        return (
          <Link
            key={view.id}
            href={view.href}
            role="tab"
            aria-selected={on}
            title={compact ? view.label : undefined}
            className={cn('flex h-8 items-center justify-center gap-1.5 rounded-full transition-colors', on ? 'bg-ink text-paper' : 'text-ink-3 hover:text-ink')}
          >
            {compact ? view.icon : view.label}
            {compact && <span className="sr-only">{view.label}</span>}
          </Link>
        );
      })}
    </div>
  );

  const railLink = (item: WorkspaceItem) => {
    const on = isOn(pathname, item);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={on ? 'page' : undefined}
        className={cn(
          'group relative flex h-10 items-center gap-3 rounded-full text-[14px] font-medium transition-colors',
          expanded ? 'px-3' : 'w-10 justify-center',
          on ? 'bg-ink text-paper' : 'text-ink-3 hover:bg-sunken hover:text-ink',
        )}
      >
        <span className="shrink-0">{item.icon}</span>
        {expanded ? (
          <span className="truncate">{item.label}</span>
        ) : (
          <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-3 -translate-y-1/2 whitespace-nowrap rounded-[7px] bg-ink px-2 py-1 text-[12px] font-medium text-paper opacity-0 shadow-lift transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {item.label}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="md:flex md:gap-8 md:px-6 lg:px-8">
      <div className={cn('sticky top-20 hidden shrink-0 flex-col gap-4 self-start pt-6 md:flex', expanded ? 'w-[208px]' : 'w-[60px] items-center')}>
        {switcher(!expanded)}
        <aside
          aria-label={label}
          className={cn('flex flex-col gap-1 border border-rule bg-raised p-1.5 shadow-sm transition-[width] duration-200', expanded ? 'w-full rounded-[22px]' : 'w-[52px] items-center rounded-full')}
        >
          <nav aria-label={`${label} pages`} className="flex w-full flex-col items-stretch gap-1">
            {items.map(railLink)}
          </nav>
          {more.length > 0 && (
            <>
              <span aria-hidden className={cn('my-1 h-px bg-rule', expanded ? 'mx-2' : 'mx-auto w-6')} />
              <nav aria-label={`More in ${label}`} className="flex w-full flex-col items-stretch gap-1">
                {more.map(railLink)}
              </nav>
            </>
          )}
          <span aria-hidden className={cn('my-1 h-px bg-rule', expanded ? 'mx-2' : 'mx-auto w-6')} />
          <button
            type="button"
            onClick={toggle}
            aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={expanded}
            className={cn('flex h-10 items-center gap-3 rounded-full text-[13px] text-ink-3 hover:bg-sunken hover:text-ink', expanded ? 'px-3' : 'w-10 justify-center')}
          >
            <Icon.ChevronRight size={15} className={cn('shrink-0 transition-transform', expanded && 'rotate-180')} />
            {expanded && 'Collapse'}
          </button>
        </aside>
      </div>

      <div className="min-w-0 flex-1">
        {/* On a phone: the switch, then this side's places as a row. */}
        <div className="flex flex-col gap-3 border-b border-rule px-4 py-3 md:hidden">
          {switcher(false)}
          <nav aria-label={label} className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
            {[...items, ...more].map((item) => {
              const on = isOn(pathname, item);
              return (
                <Link key={item.href} href={item.href} aria-current={on ? 'page' : undefined} className={cn('shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium', on ? 'bg-ink text-paper' : 'text-ink-3')}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="px-4 pb-24 pt-6 sm:px-6 md:px-0 md:pb-16 md:pt-8">
          <div className="mx-auto w-full max-w-[1080px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
