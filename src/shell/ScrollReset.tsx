'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/** Paths that open as a sheet over the current page (`@modal`): the page underneath keeps its place. */
const SHEET = /^\/(hire|compare)(\/|$)/;

const here = () => `${window.location.pathname}${window.location.search}`;

/**
 * A new page opens at the top; Back returns to where you were.
 *
 * Next keeps the scroll position on a client navigation whenever any part
 * of the new page is already in view, so a page opened from halfway down
 * another one opened halfway down (1,392 px into an agent's page, from the
 * catalogue). And Back does not restore the place it left: the page
 * re-renders from the top.
 *
 * So a change of path goes to the top, and Back or Forward goes to the
 * position that page last had. A link to an `#anchor` goes to the anchor; a
 * changed query (tabs, filters, the profile's view switch) stays put; a
 * sheet opening or closing leaves the page beneath it alone. Each move is
 * repeated briefly while the page streams in, and stops the moment the
 * person scrolls or presses a key, so it never fights them.
 */
export function ScrollReset() {
  const pathname = usePathname();
  const previous = useRef(pathname);
  const fromHistory = useRef(false);
  const positions = useRef(new Map<string, number>());

  useEffect(() => {
    let frame = 0;
    const remember = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => positions.current.set(here(), window.scrollY));
    };
    const mark = () => {
      fromHistory.current = true;
    };
    window.addEventListener('scroll', remember, { passive: true });
    window.addEventListener('popstate', mark);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', remember);
      window.removeEventListener('popstate', mark);
    };
  }, []);

  useEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    const history = fromHistory.current;
    fromHistory.current = false;
    if (from === pathname || window.location.hash) return;
    if (SHEET.test(pathname) || SHEET.test(from)) return;
    const target = history ? (positions.current.get(here()) ?? null) : 0;
    if (target === null) return;

    let stopped = false;
    const stop = () => {
      stopped = true;
    };
    const go = () => {
      if (!stopped && Math.abs(window.scrollY - target) > 1) window.scrollTo({ top: target, left: 0, behavior: 'instant' });
    };
    const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    for (const event of events) window.addEventListener(event, stop, { passive: true, once: true });
    go();
    // Longer for Back: the page has to stream in tall enough to reach the old position.
    const timers = (history ? [50, 150, 400, 800, 1500] : [50, 150, 400, 800]).map((ms) => window.setTimeout(go, ms));
    const done = window.setTimeout(stop, history ? 1600 : 900);
    return () => {
      stopped = true;
      timers.forEach(window.clearTimeout);
      window.clearTimeout(done);
      for (const event of events) window.removeEventListener(event, stop);
    };
  }, [pathname]);

  return null;
}
