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

/**
 * The choice is kept in a cookie rather than localStorage so the server can
 * read it and stamp `data-theme` during SSR. That removes the pre-paint
 * inline script entirely: there is no flash to prevent, because the correct
 * theme is in the first byte of HTML.
 */
const COOKIE_KEY = 'pokter-theme';

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readCookie(): Theme {
  const match = document.cookie.match(/(?:^|;\s*)pokter-theme=(light|dark)/);
  return match ? (match[1] as Theme) : 'system';
}

function getTheme(): Theme {
  try {
    return readCookie();
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

  // A year, path-wide, Lax: a display preference, not a credential.
  document.cookie =
    theme === 'system'
      ? `${COOKIE_KEY}=; path=/; max-age=0; samesite=lax`
      : `${COOKIE_KEY}=${theme}; path=/; max-age=31536000; samesite=lax`;

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
