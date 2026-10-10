'use client';

import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const COOKIE_KEY = 'pokter-theme';
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getTheme(): Theme {
  try {
    const match = document.cookie.match(/(?:^|;\s*)pokter-theme=(light|dark)/);
    return match ? (match[1] as Theme) : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Stamps the choice on <html> and in a cookie the root layout reads during
 * SSR, so the next page arrives in the right palette with no flash.
 * "System" removes both and lets the media query decide.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  document.cookie =
    theme === 'system'
      ? `${COOKIE_KEY}=; path=/; max-age=0; samesite=lax`
      : `${COOKIE_KEY}=${theme}; path=/; max-age=31536000; samesite=lax`;
  for (const listener of listeners) listener();
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => 'system');
}
