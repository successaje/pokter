'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { useHydrated } from '@/lib/ui/use-hydrated';

import { Icon } from '@/ui/icons';

/*
 * Getting back to the results a buyer was looking at.
 *
 * Discover keeps its search, filters and network in the address, so the
 * browser's Back works. The profile's own "Discover" link went to a bare
 * /discover and dropped all of it. Discover now notes its address for this
 * tab (session storage: the query only, gone when the tab closes), and a
 * profile reached from it offers a way back to exactly those results.
 */
const KEY = 'pokter:discover-results';

/** Rendered on Discover: remembers the current results for this tab. */
export function RememberDiscoverResults() {
  const pathname = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    try {
      const query = params.toString();
      if (query) window.sessionStorage.setItem(KEY, `${pathname}?${query}`);
      else window.sessionStorage.removeItem(KEY);
    } catch {
      /* Storage blocked: Back still works. */
    }
  }, [pathname, params]);
  return null;
}

function saved(): string | null {
  try {
    const value = window.sessionStorage.getItem(KEY);
    return value && value.startsWith('/discover?') ? value : null;
  } catch {
    return null;
  }
}

/** Rendered on a profile: a link back to the filtered results, when there are some. */
export function BackToResults() {
  // Read after hydration: the server has no session storage to agree with.
  const hydrated = useHydrated();
  const href = hydrated ? saved() : null;
  if (!href) return null;
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-2 hover:text-ink hover:underline">
      <Icon.ChevronLeft size={13} /> Back to your results
    </Link>
  );
}
