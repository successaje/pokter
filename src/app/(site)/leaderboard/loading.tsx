import { LoadingRegion, Skeleton } from '@/ui/Feedback';

/**
 * Leaderboard-shaped, and it has to stay that way.
 *
 * The board is `force-dynamic` over the job index and the probe history, so
 * this is what a visitor sees on a cold machine. The order below is the
 * order the page renders in — compact header, the two tabs, the one control
 * row, the quiet meta line, then rows — because a skeleton that promises one
 * layout and delivers another reads as the page breaking, which is the worst
 * first impression for a page whose subject is whether its figures can be
 * trusted.
 *
 * The rows are the right height, so nothing jumps when they arrive.
 *
 * Deliberately no placeholder numbers. A shimmering block says "loading"; a
 * greyed-out figure would be a figure.
 */
export default function LeaderboardLoading() {
  return (
    <LoadingRegion label="Loading the leaderboard">
      <div className="mx-auto w-full max-w-[1060px] px-4 pb-20 pt-6 sm:px-6 sm:pt-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48 sm:h-10" />
          <Skeleton className="h-4 w-64" />
        </div>

        <div className="mt-5 flex gap-5 border-b border-rule pb-2.5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-28" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Skeleton className="h-10 w-32 rounded-[10px]" />
          <Skeleton className="h-10 w-28 rounded-[10px]" />
          <div className="w-full sm:ml-auto sm:w-56">
            <Skeleton className="h-10 w-full rounded-[10px]" />
          </div>
        </div>

        <div className="mt-3 border-b border-rule pb-3">
          <Skeleton className="h-3 w-80 max-w-full" />
        </div>

        <div className="mt-6 flex items-baseline gap-2.5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3.5 w-16" />
        </div>

        <div className="mt-3 flex flex-col divide-y divide-rule border-t border-rule">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex min-h-[56px] items-center gap-3 py-2.5 sm:min-h-[60px]">
              <Skeleton className="h-3 w-5 shrink-0" />
              <Skeleton className="size-[30px] shrink-0 rounded-full" />
              <Skeleton className="h-4 w-40 max-w-[40%]" />
              <Skeleton className="ml-auto h-4 w-14 shrink-0" />
              <Skeleton className="hidden h-3 w-20 shrink-0 sm:block" />
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
