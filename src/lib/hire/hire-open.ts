'use client';

import { useSyncExternalStore } from 'react';

/*
 * Whether the hire drawer is open, shared by every button that opens it (the
 * rail, the header, the phone bar) and the drawer itself. A module store
 * rather than context, so the buttons can live anywhere on the page.
 */
let open = false;
const listeners = new Set<() => void>();

export function setHireOpen(next: boolean): void {
  open = next;
  for (const listener of listeners) listener();
}

export function useHireOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
    () => false,
  );
}
