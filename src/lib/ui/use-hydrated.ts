'use client';

import { useSyncExternalStore } from 'react';

/** Nothing to subscribe to: this value changes once, when React hydrates. */
const noop = () => () => {};

/**
 * False while the server renders and during the client's hydration pass,
 * true for every render after.
 *
 * For UI whose content comes from this browser — localStorage, the current
 * time, a media query. The server cannot know it, so rendering it on the
 * first client pass makes the markup disagree with the HTML React is
 * matching against, and React throws out the tree.
 *
 * `useSyncExternalStore` rather than an effect that sets state: it is the
 * pattern this codebase already uses for browser-held state, it needs no
 * effect, and it is the only hook that distinguishes the hydration render
 * from later ones. A `useState` initialiser cannot — it runs on the client
 * with the real value while the server rendered the empty one, which is
 * exactly the mismatch this exists to prevent.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
