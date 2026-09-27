import { Skeleton, SkeletonRegion } from '@/components/ui/Skeleton';

/**
 * Mirrors the dossier: back link, identity header, then the evidence
 * sections. Only the first two sections are drawn — below that the real page
 * is collapsed on a phone, so drawing more would promise a longer page than
 * the one that arrives.
 */
export default function LoadingAgent() {
  return (
    <SkeletonRegion
      label="Loading this agent's evidence"
      className="flex flex-col gap-6 pt-2"
    >
      <Skeleton className="h-3 w-24" />

      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="size-14 shrink-0 rounded-[var(--radius-lg)]" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-2.5 h-7 w-64 max-w-full" />
            <Skeleton className="mt-3 h-5 w-28 rounded-full" />
          </div>
        </div>
        <Skeleton className="mt-5 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-3/4" />
        <div className="mt-5 grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      </div>

      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-full max-w-lg" />
          <Skeleton className="h-32 w-full rounded-[var(--radius-lg)]" />
        </div>
      ))}
    </SkeletonRegion>
  );
}
