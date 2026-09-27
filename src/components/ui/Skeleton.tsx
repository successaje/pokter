import { cn } from '@/lib/ui/cn';

/**
 * A placeholder block.
 *
 * Skeletons exist to hold the *shape* of what is coming, so the page does not
 * reflow when data lands. A skeleton that does not match its final layout is
 * worse than a spinner, because it promises a layout and then breaks it.
 *
 * `aria-hidden`: a screen reader should hear the region's loading state once,
 * from the live region on the container, not once per grey box.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'skeleton rounded-[var(--radius)] bg-[color:var(--surface-raised)]',
        className,
      )}
    />
  );
}

/**
 * Wraps a set of skeletons and announces the wait once.
 */
export function SkeletonRegion({
  label,
  className,
  children,
}: {
  /** What is loading, e.g. "Loading agent evidence". */
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** The agent card's shape, for marketplace lists. */
export function AgentCardSkeleton() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-2 h-3 w-1/3" />
        </div>
        <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
    </div>
  );
}

/** A titled block of body copy, for detail sections. */
export function SectionSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <Skeleton className="h-4 w-40" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton
            key={i}
            className={cn('h-3', i === lines - 1 ? 'w-3/5' : 'w-full')}
          />
        ))}
      </div>
    </div>
  );
}
