'use client';

import { useSyncExternalStore } from 'react';

/**
 * The agents a person has picked to compare, kept for the session so the
 * selection survives moving between Discover and agent pages. Capped at
 * four: beyond that a comparison stops being readable on a phone.
 */
export const COMPARE_MAX = 4;
const KEY = 'pokter.compare.v1';
const listeners = new Set<() => void>();
let cache: string[] | null = null;

function read(): string[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string' && /^\d+:\d+$/.test(k)).slice(0, COMPARE_MAX) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: string[]) {
  cache = next.slice(0, COMPARE_MAX);
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* Private mode: the selection lasts for this page only. */
  }
  for (const l of listeners) l();
}

const EMPTY: string[] = [];

export function useCompare() {
  const keys = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => EMPTY,
  );
  return {
    keys,
    has: (key: string) => keys.includes(key),
    toggle: (key: string) => write(keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]),
    clear: () => write([]),
    full: keys.length >= COMPARE_MAX,
  };
}
