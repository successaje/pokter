'use client';

import { usePathname } from 'next/navigation';

/**
 * The full footer on the landing page, the compact one everywhere else.
 *
 * A layout is not told its pathname and there is no middleware here to put
 * it in a header, so the choice is made on the client. Both arrive already
 * rendered on the server — only the picking is client-side, so none of the
 * footer's links become JavaScript.
 *
 * The cost is that both are in the payload on every page. That is the price
 * of the five-column version existing at all, and it buys back far more on
 * the pages that now render the short one: a catalogue page did not need a
 * site map and a wordmark the height of a screen under every search.
 */
/* Hiring, Building and Settings are working views with their own navigation; a footer under the sidebar is noise. */
const WORKING = /^\/(workspace|account)(\/|$)|^\/build(\/(?!integration)|$)/;

export function FooterForRoute({ full, compact }: { full: React.ReactNode; compact: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  if (WORKING.test(pathname)) return null;
  return pathname === '/' ? <>{full}</> : <>{compact}</>;
}
