'use client';

import { useSyncExternalStore } from 'react';

/**
 * Theme selection.
 *
 * Three states, not two: dark, light, and following the system. "System" is the
 * default and is a real choice — a user whose OS switches at sunset should not
 * have to come back and flip this.
 *
 * The chosen value is written to the document element, where the CSS in
 * globals.css takes over. An inline script in the layout applies it before
 * first paint so the page never flashes the wrong theme.
 */
export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'pokter.theme';

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', emit);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', emit);
  };
}

function getTheme(): Theme {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

/** Must match the server render, which cannot know the preference. */
function getServerTheme(): Theme {
  return 'system';
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  try {
    if (theme === 'system') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not remembered across reloads; still applied for this session.
  }

  emit();
}

const OPTIONS: { id: Theme; label: string; icon: string }[] = [
  { id: 'light', label: 'Light', icon: '☀' },
  { id: 'system', label: 'System', icon: '◐' },
  { id: 'dark', label: 'Dark', icon: '☾' },
];

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 rounded-[var(--radius)] border border-[color:var(--border)] p-0.5"
    >
      {OPTIONS.map((option) => {
        const active = theme === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => applyTheme(option.id)}
            className={
              active
                ? 'rounded-[4px] bg-[color:var(--surface-raised)] px-1.5 py-1 text-[11px] leading-none text-[color:var(--text)]'
                : 'rounded-[4px] px-1.5 py-1 text-[11px] leading-none text-[color:var(--text-faint)] transition-colors hover:text-[color:var(--text-secondary)]'
            }
          >
            <span aria-hidden>{option.icon}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Applied before first paint, so a light-theme user never sees a dark flash.
 * Kept tiny and dependency-free because it runs synchronously in the document
 * head, and wrapped in try/catch because blocked site data throws on access.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
