import { cn } from '@/lib/ui/cn';

/**
 * Scroll-triggered entrance, done in CSS rather than JavaScript.
 *
 * Uses a scroll-driven animation timeline, so there is no observer, no state
 * and no client component — which means content is never hidden behind a
 * script that might not run. Browsers without support simply render the
 * element normally, and the reduced-motion rule in globals.css disables it.
 *
 * This is a server component on purpose: motion should not cost a hydration
 * boundary.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  /** Milliseconds, for staggering siblings. */
  delay?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('reveal', className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
