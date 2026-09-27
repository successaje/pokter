'use client';

import { useEffect, useState } from 'react';

/** The `md` breakpoint, matching the Tailwind config the layouts are built on. */
const PHONE = '(max-width: 767px)';

/**
 * True at phone widths.
 *
 * Starts false and is corrected in an effect, deliberately: the server has no
 * viewport, so any other initial value would be a guess that React would have
 * to reconcile, and the first paint would flicker between two layouts.
 *
 * This is for cases where the two layouts are genuinely different components —
 * a popover versus a modal sheet. Where CSS can express the difference, a
 * media query is better: it needs no JavaScript and is right on the first
 * frame.
 */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(PHONE);
    const sync = () => setIsPhone(query.matches);

    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return isPhone;
}
