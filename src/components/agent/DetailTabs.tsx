'use client';

import { useRef, useSyncExternalStore, type ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

export interface DetailTab {
  id: string;
  label: string;
  content: ReactNode;
}

/*
 * The selected tab lives in the URL fragment.
 *
 * Every section used to have its own anchor, so links into this page — from
 * the nav, from a shared URL — pointed at a heading. Tabs would have broken
 * all of them silently. Reading the fragment keeps those links working and
 * makes a chosen tab shareable, which a tab held only in component state
 * never is.
 *
 * Read through useSyncExternalStore rather than an effect so the first render
 * already has the right tab instead of flashing the default and correcting it.
 */
function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

function readHash(): string {
  return window.location.hash.replace(/^#/, '');
}

export function DetailTabs({ tabs }: { tabs: DetailTab[] }) {
  const hash = useSyncExternalStore(subscribe, readHash, () => '');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === hash),
  );
  const active = tabs[activeIndex] ?? tabs[0];

  const select = (id: string) => {
    // replaceState rather than a hash assignment: selecting a tab should not
    // scroll the page to the panel, nor add an entry to the back button for
    // every tab someone glances at.
    window.history.replaceState(null, '', `#${id}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  /** Left and right move between tabs, as a tablist is expected to. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    const delta =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = (activeIndex + delta + tabs.length) % tabs.length;
    select(tabs[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Agent details"
        onKeyDown={onKeyDown}
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-[color:var(--border)] px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === active.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id)}
              className={cn(
                '-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors',
                selected
                  ? 'border-[color:var(--brand)] text-[color:var(--brand)]'
                  : 'border-transparent text-[color:var(--text-muted)] hover:text-[color:var(--text)]',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/*
        Every panel stays mounted and the inactive ones are hidden.
        
        These are server-rendered panels holding the page's evidence;
        unmounting them would throw away work already done and paid for, and
        the browser's own find-in-page would stop reaching anything not
        currently selected — on a page whose argument is that everything is
        inspectable.
      */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={tab.id !== active.id}
          className="flex flex-col gap-8"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
