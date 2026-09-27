import { Skeleton, SkeletonRegion } from '@/components/ui/Skeleton';

/**
 * The hire route takes roughly six seconds to become useful: it reads the
 * dossier, the live probe, provider choices and a pool price before it can
 * render. The global fallback stood in with a four-card grid that this page
 * never shows, which is the failure the skeleton is supposed to prevent — it
 * promised a layout and then replaced it with a different one.
 *
 * This mirrors the real hire layout instead: header, wallet readiness, then
 * the two stages.
 */
export default function LoadingHire() {
  return (
    <SkeletonRegion
      label="Loading this agent's hire terms"
      className="flex flex-col gap-8 pt-2"
    >
      <Skeleton className="h-3 w-28" />

      <div className="flex flex-col gap-3">
        <Skeleton className="h-2.5 w-12" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-56 rounded-full" />
        <Skeleton className="h-3 w-full max-w-xl" />
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
        <Skeleton className="h-4 w-36" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      </div>

      {[
        'Review access',
        'Commission work',
      ].map((stage) => (
        <div key={stage} className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <Skeleton className="size-5 shrink-0 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-2.5 w-60 max-w-full" />
            </div>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="mt-2.5 h-3 w-4/5" />
            <Skeleton className="mt-5 h-11 w-full rounded-[var(--radius)]" />
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}
