'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export const NAV_DEPTH_KEY = 'pokter:nav-depth';
const NAV_LAST_KEY = 'pokter:nav-last';

/**
 * Counts pages visited in this tab, so a back link can tell an in-site
 * previous page from a link opened cold. `document.referrer` cannot: it is
 * fixed at the first load and never changes on client navigation.
 */
export function NavigationMemory() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      // Count a page once, however many times the effect runs for it.
      if (window.sessionStorage.getItem(NAV_LAST_KEY) === pathname) return;
      window.sessionStorage.setItem(NAV_LAST_KEY, pathname);
      const depth = Number(window.sessionStorage.getItem(NAV_DEPTH_KEY) ?? '0');
      window.sessionStorage.setItem(NAV_DEPTH_KEY, String(depth + 1));
    } catch {
      /* Storage blocked: back links fall back to their default destination. */
    }
  }, [pathname]);
  return null;
}
