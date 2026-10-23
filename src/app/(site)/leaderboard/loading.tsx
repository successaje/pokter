import { LoadingRegion, Skeleton } from '@/ui/Feedback';

/**
 * Leaderboard-shaped, and it has to stay that way.
 *
 * The board is `force-dynamic` over the job index and the probe history, so
 * this is what a visitor sees on a cold machine. The order below is the
 * order the page renders in — header, the board tabs, the control bar, the
 * category chips, the consistency notice, the four coverage tiles, the row
 * count with its pager, then the table — because a skeleton that promises
 * one layout and delivers another reads as the page breaking, which is the
 * worst first impression for a page whose subject is whether its figures can
 * be trusted.
 *
 * Deliberately no placeholder rows with numbers in them. A shimmering block
 * says "loading"; a greyed-out figure would be a figure.
 */
export default function LeaderboardLoading() {
  return (
    <LoadingRegion label="Loading the leaderboard">
      <div className="frame pb-24 pt-10 sm:pt-16">
        <div className="grid gap-8 border-b border-rule pb-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)] lg:items-end">
          <div className="flex max-w-3xl flex-col gap-4">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-14 w-full max-w-xl" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-full max-w-2xl" />
              <Skeleton className="h-5 w-4/5 max-w-xl" />
            </div>
          </div>
          <Skeleton className="h-28 w-full rounded-[14px]" />
        </div>

        {/* The two board tabs. */}
        <div className="flex gap-6 border-b border-rule pt-6">
          {['outcomes', 'responsiveness'].map((key) => (
            <Skeleton key={key} className="mb-3 mt-3 h-4 w-32" />
          ))}
        </div>

        {/* Network, period and search, then the category chips. */}
        <div className="flex flex-col gap-4 border-b border-rule py-5">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            {['network', 'period'].map((key) => (
              <div key={key} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-[34px] w-48 rounded-[10px]" />
              </div>
            ))}
            <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-[34px] w-full rounded-[9px]" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-[34px] w-full max-w-md rounded-[10px]" />
          </div>
        </div>

        <div className="py-6">
          <Skeleton className="h-24 w-full rounded-[12px]" />
        </div>

        <div className="border-b border-rule pb-4">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="mt-2 h-8 w-full max-w-md" />
          <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
        </div>

        {/* Coverage and last refresh: four tiles. */}
        <div className="grid gap-px overflow-hidden rounded-[12px] border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2 bg-raised p-4">
              <Skeleton className="h-2.5 w-3/4" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ))}
        </div>

        {/* How many rows are shown, and the pager that moves between them. */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-3.5 w-56" />
          <Skeleton className="h-8 w-44 rounded-[7px]" />
        </div>

        <div className="mt-3 overflow-hidden rounded-[14px] border border-rule">
          <div className="flex gap-4 bg-sunken/70 px-3 py-2.5">
            {['w-10', 'w-24', 'w-28', 'w-28', 'w-24', 'w-20', 'w-16'].map((w) => (
              <Skeleton key={w} className={`h-3 ${w}`} />
            ))}
          </div>
          <div className="divide-y divide-rule bg-raised">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-start gap-4 px-4 py-4">
                <Skeleton className="h-4 w-6" />
                <Skeleton className="size-9 rounded-[10px]" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-4 w-10" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
