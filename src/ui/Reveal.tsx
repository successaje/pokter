import type { ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

/**
 * Lets a section settle into place as it scrolls into view, using CSS
 * scroll-driven animation. Nothing is hidden by script: where the browser
 * lacks `animation-timeline`, or prefers reduced motion, the content is
 * simply there. `delay` staggers siblings by shifting their animation range.
 */
export function Reveal({ children, className, delay = 0, as: Tag = 'div' }: { children: ReactNode; className?: string; delay?: number; as?: 'div' | 'section' | 'li' }) {
  return (
    <Tag className={cn('reveal', className)} style={delay ? ({ '--reveal-offset': `${Math.min(delay / 10, 20)}%` } as React.CSSProperties) : undefined}>
      {children}
    </Tag>
  );
}
