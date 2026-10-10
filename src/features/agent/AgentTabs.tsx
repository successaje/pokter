'use client';

import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

export const AGENT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'work', label: 'Work and reviews' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'technical', label: 'Technical' },
] as const;

export type AgentTabId = (typeof AGENT_TABS)[number]['id'];

/*
 * The selected tab lives in the URL hash, so a tab can be shared and reloads
 * open on it. Switching tabs replaces the entry rather than adding history. Anchors inside a panel (for example #try, the free trial)
 * resolve to the panel that holds them.
 */
const ANCHOR_TO_TAB: Record<string, AgentTabId> = { try: 'overview' };
const EVENT = 'pokter:agent-tab';
let direction: 'left' | 'right' = 'right';

function tabFromHash(): AgentTabId {
  const hash = window.location.hash.replace('#', '');
  if (AGENT_TABS.some((t) => t.id === hash)) return hash as AgentTabId;
  return ANCHOR_TO_TAB[hash] ?? 'overview';
}

function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  window.addEventListener('popstate', listener);
  window.addEventListener(EVENT, listener);
  return () => {
    window.removeEventListener('hashchange', listener);
    window.removeEventListener('popstate', listener);
    window.removeEventListener(EVENT, listener);
  };
}

function useActiveTab(): AgentTabId {
  return useSyncExternalStore(subscribe, tabFromHash, () => 'overview');
}

function select(next: AgentTabId) {
  const current = tabFromHash();
  if (next === current) return;
  const from = AGENT_TABS.findIndex((t) => t.id === current);
  const to = AGENT_TABS.findIndex((t) => t.id === next);
  direction = to > from ? 'right' : 'left';
  // replaceState does not scroll; the event tells both halves to re-read.
  window.history.replaceState(null, '', next === 'overview' ? window.location.pathname + window.location.search : `#${next}`);
  window.dispatchEvent(new Event(EVENT));
}

/** The tab bar. Arrow keys move between tabs, as the ARIA tabs pattern expects. */
export function AgentTabBar() {
  const active = useActiveTab();
  const bar = useRef<HTMLDivElement>(null);

  const choose = (id: AgentTabId) => {
    select(id);
    // Bring the content top back under the bar if the reader had scrolled past it.
    const top = bar.current?.getBoundingClientRect().top ?? 0;
    const anchor = document.getElementById('agent-tab-panels');
    if (anchor && anchor.getBoundingClientRect().top < top) {
      window.scrollTo({ top: window.scrollY + anchor.getBoundingClientRect().top - (bar.current?.offsetHeight ?? 0) - 72, behavior: 'smooth' });
    }
  };

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? AGENT_TABS.length - 1 : (index + delta + AGENT_TABS.length) % AGENT_TABS.length;
    const next = AGENT_TABS[nextIndex].id;
    choose(next);
    document.getElementById(`agent-tab-${next}`)?.focus();
  };

  return (
    <div ref={bar} className="sticky top-14 z-20 border-b border-rule bg-[color-mix(in_oklab,var(--paper)_92%,transparent)] backdrop-blur-md">
      <div role="tablist" aria-label="Agent details" className="frame no-scrollbar flex gap-6 overflow-x-auto text-[13.5px] font-medium">
        {AGENT_TABS.map((tab, i) => {
          const on = tab.id === active;
          return (
            <button
              key={tab.id}
              id={`agent-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`agent-panel-${tab.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => choose(tab.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                'relative flex h-11 shrink-0 items-center transition-colors',
                on ? 'text-ink' : 'text-ink-3 hover:text-ink',
              )}
            >
              {tab.label}
              <span aria-hidden className={cn('absolute inset-x-0 -bottom-px h-0.5 origin-center bg-ink transition-transform duration-300 ease-out', on ? 'scale-x-100' : 'scale-x-0')} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One panel. Every panel stays in the page (search engines and find-in-page
 * still see all of it); inactive ones are hidden, and the active one slides
 * in from the side of the tab it came from.
 */
export function AgentTabPanel({ id, children }: { id: AgentTabId; children: ReactNode }) {
  const active = useActiveTab();
  const on = active === id;
  const ref = useRef<HTMLDivElement>(null);

  // Arriving on an anchor inside this panel (e.g. #try) scrolls to it once shown.
  useEffect(() => {
    if (!on) return;
    const hash = window.location.hash.replace('#', '');
    if (hash && ANCHOR_TO_TAB[hash] === id) document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [on, id]);

  return (
    <div
      ref={ref}
      id={`agent-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`agent-tab-${id}`}
      hidden={!on}
      tabIndex={-1}
      className={cn('focus-visible:outline-none', on && (direction === 'right' ? 'tab-in-right' : 'tab-in-left'))}
    >
      {children}
    </div>
  );
}
