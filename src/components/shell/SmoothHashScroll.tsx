'use client';

import { useEffect } from 'react';

/**
 * The in-page glide, without breaking navigation.
 *
 * `scroll-behavior: smooth` on the root applied to every scroll the browser
 * performs, including the jump to the top that the App Router does on a route
 * change — which the incoming render then interrupted, leaving the new page
 * scrolled part way down. This does the same thing for the case that actually
 * wanted it, a link to an anchor on the page you are already on, and nothing
 * else.
 *
 * Progressive: if this never runs, those links still work and simply jump.
 */
export function SmoothHashScroll() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      // Let the browser handle anything that is not a plain left click.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = (event.target as Element | null)?.closest?.('a');
      const href = anchor?.getAttribute('href');
      if (!anchor || !href?.startsWith('#') || href === '#') return;

      const target = document.getElementById(href.slice(1));
      if (!target) return;

      if (
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        return;
      }

      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Keep the fragment in the URL so the view stays shareable.
      history.pushState(null, '', href);
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return null;
}
