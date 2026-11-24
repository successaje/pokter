'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Arms its element once the script runs, then marks it `data-seen` the first
 * time a fifth of it is on screen, and never again. The CSS under
 * `[data-inview][data-armed]` does the rest: children marked `.seq-item`,
 * `.seq-draw` or `.seq-drop` arrive in order, each `--i` steps behind the
 * one before. Nothing is hidden before the script arms it, so a page read
 * without one shows everything.
 */
export function InView({ children, className, as: Tag = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'ol' | 'ul' }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.dataset.armed = 'true';
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        node.dataset.seen = 'true';
        seen.disconnect();
      },
      { threshold: 0.2, rootMargin: '0px 0px -8% 0px' },
    );
    seen.observe(node);
    return () => seen.disconnect();
  }, []);
  return (
    <Tag ref={ref as React.RefObject<never>} data-inview="" className={className}>
      {children}
    </Tag>
  );
}
