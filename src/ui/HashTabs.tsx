'use client';

import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

export type HashTab = { id: string; label: string };

/*
 * Tabs whose selection lives in the URL hash, so a tab can be shared and a
 * reload opens on it. Switching replaces the history entry rather than adding
 * one. A tab bar and its panels can sit in different parts of the page: both
 * read the same small store. Anchors inside a panel can be mapped to it.
 */
const EVENT = 'pokter:hash-tab';
let direction: 'left' | 'right' = 'right';

function read(tabs: readonly HashTab[], anchors: Record<string, string>): string {
  const hash = window.location.hash.replace('#', '');
  if (tabs.some((t) => t.id === hash)) return hash;
  return anchors[hash] ?? tabs[0].id;
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

export function useHashTab(tabs: readonly HashTab[], anchors: Record<string, string> = {}): string {
  return useSyncExternalStore(subscribe, () => read(tabs, anchors), () => tabs[0].id);
}

function select(tabs: readonly HashTab[], anchors: Record<string, string>, next: string) {
  const current = read(tabs, anchors);
  if (next === current) return;
  const from = tabs.findIndex((t) => t.id === current);
  const to = tabs.findIndex((t) => t.id === next);
  direction = to > from ? 'right' : 'left';
  const url = next === tabs[0].id ? window.location.pathname + window.location.search : `#${next}`;
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new Event(EVENT));
}

/** The tab bar: ARIA tabs, arrow/Home/End keys, a sliding underline. */
export function HashTabBar({
  tabs,
  anchors = {},
  label,
  panelsId,
  className,
  innerClassName,
}: {
  tabs: readonly HashTab[];
  anchors?: Record<string, string>;
  label: string;
  /** Element whose top the content returns to after a switch. */
  panelsId: string;
  className?: string;
  innerClassName?: string;
}) {
  const active = useHashTab(tabs, anchors);
  const bar = useRef<HTMLDivElement>(null);

  // React owns the tabs from here; drop any pre-hydration hint.
  useEffect(() => {
    delete document.documentElement.dataset.hashTab;
  }, []);

  const choose = (id: string) => {
    select(tabs, anchors, id);
    const anchor = document.getElementById(panelsId);
    const barBottom = bar.current?.getBoundingClientRect().bottom ?? 0;
    if (anchor && anchor.getBoundingClientRect().top < barBottom) {
      window.scrollTo({ top: window.scrollY + anchor.getBoundingClientRect().top - barBottom - 16, behavior: 'smooth' });
    }
  };

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const i = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + delta + tabs.length) % tabs.length;
    choose(tabs[i].id);
    document.getElementById(`tab-${tabs[i].id}`)?.focus();
  };

  return (
    <div ref={bar} className={className}>
      <div role="tablist" aria-label={label} className={cn('no-scrollbar flex gap-6 overflow-x-auto text-[13.5px] font-medium', innerClassName)}>
        {tabs.map((tab, i) => {
          const on = tab.id === active;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`panel-${tab.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => choose(tab.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn('relative flex h-11 shrink-0 items-center transition-colors', on ? 'text-ink' : 'text-ink-3 hover:text-ink')}
            >
              {tab.label}
              <span aria-hidden className={cn('absolute inset-x-0 -bottom-px h-0.5 bg-ink transition-transform duration-300 ease-out', on ? 'scale-x-100' : 'scale-x-0')} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One panel. All panels stay in the page (find-in-page and crawlers see
 * everything); the active one slides in from the side of the previous tab.
 */
export function HashTabPanel({ tabs, anchors = {}, id, children }: { tabs: readonly HashTab[]; anchors?: Record<string, string>; id: string; children: ReactNode }) {
  const active = useHashTab(tabs, anchors);
  const on = active === id;

  // Arriving on an anchor that lives in this panel scrolls to it once shown.
  useEffect(() => {
    if (!on) return;
    const hash = window.location.hash.replace('#', '');
    if (hash && anchors[hash] === id) document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [on, id, anchors]);

  return (
    <div
      id={`panel-${id}`}
      data-tab-panel={id}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      hidden={!on}
      tabIndex={-1}
      className={cn('focus-visible:outline-none', on && (direction === 'right' ? 'tab-in-right' : 'tab-in-left'))}
    >
      {children}
    </div>
  );
}

/**
 * Runs before first paint so a shared link to a tab paints that tab rather
 * than the first. It marks <html>; CSS generated for the known tab ids does
 * the rest. Only listed ids are accepted.
 */
export function HashTabHint({ tabs }: { tabs: readonly HashTab[] }) {
  const ids = JSON.stringify(tabs.map((t) => t.id));
  const first = JSON.stringify(tabs[0].id);
  const code = `(function(){var h=location.hash.slice(1);if(h!==${first}&&${ids}.indexOf(h)>-1)document.documentElement.dataset.hashTab=h;})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

/** The CSS the hint relies on, for a given tab set. Render once per page. */
export function HashTabHintStyle({ tabs }: { tabs: readonly HashTab[] }) {
  const first = tabs[0].id;
  const css = tabs
    .slice(1)
    .map((t) => `html[data-hash-tab="${t.id}"] [data-tab-panel="${first}"]{display:none}html[data-hash-tab="${t.id}"] [data-tab-panel="${t.id}"]{display:block}`)
    .join('');
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
