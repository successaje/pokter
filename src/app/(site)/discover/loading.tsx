import { LoadingRegion, Skeleton } from '@/ui/Feedback';

/**
 * Discover-shaped, and it has to stay that way.
 *
 * This still drew the old page: a 232px filter column that no longer
 * exists, no marks, no counts, and cards without the three readings or
 * the price line. A skeleton that does not match what arrives is worse
 * than none — it promises one layout and delivers another, and the jump
 * reads as the page breaking.
 */
export default function DiscoverLoading() {
  return (
    <LoadingRegion label="Loading agents">
      <div className="frame pb-24 pt-8 sm:pt-12">
        <div className="flex flex-col gap-4">
          {/* What is live, and how much can be hired. */}
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-7 w-56 rounded-full" />
            <Skeleton className="h-7 w-44 rounded-full" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-full max-w-2xl" />
            <Skeleton className="h-5 w-4/5 max-w-xl" />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-7 gap-y-2">
            {/* Keyed by position: two of the widths are the same. */}
            {['w-24', 'w-20', 'w-20'].map((w, i) => (
              <Skeleton key={i} className={`h-4 ${w}`} />
            ))}
          </div>
        </div>
        <Skeleton className="mt-6 h-14 w-full rounded-[14px]" />

        <div className="mt-8 flex flex-col gap-6">
          {/* The two pill lines, availability and evidence over tasks. */}
          <div className="hidden flex-col gap-2.5 lg:flex">
            <div className="flex flex-wrap items-center gap-2">
              {['w-36', 'w-44', 'w-40', 'w-14', 'w-40', 'w-44'].map((w, i) => (
                <Skeleton key={i} className={`h-8 rounded-full ${w}`} />
              ))}
              <Skeleton className="ml-auto h-8 w-40 rounded-[7px]" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {['w-28', 'w-32', 'w-32', 'w-36', 'w-32', 'w-28'].map((w, i) => (
                <Skeleton key={i} className={`h-8 rounded-full ${w}`} />
              ))}
            </div>
          </div>

          <section>
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-rule pb-4">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-32" />
            </div>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <li key={i} className="flex flex-col gap-3.5 rounded-[16px] border border-rule bg-raised p-5">
                  <div className="flex items-start gap-3.5">
                    <Skeleton className="size-12 rounded-[10px]" />
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-5/6" />
                  </div>
                  {/* Replies, paid jobs, delivers. */}
                  <div className="mt-1 grid grid-cols-3 gap-3">
                    {['Replies', 'Paid', 'Delivers'].map((k) => (
                      <div key={k} className="flex flex-col gap-1.5">
                        <Skeleton className="h-2.5 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-3 border-t border-rule pt-4">
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-6 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-9 w-20 rounded-[9px]" />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Recently listed. */}
          <section className="mt-6 border-t border-rule pt-8">
            <Skeleton className="mb-4 h-3 w-32" />
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="flex items-start gap-3 rounded-[12px] border border-rule bg-raised p-3.5">
                  <Skeleton className="size-9 rounded-[10px]" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                  <Skeleton className="h-3.5 w-12" />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </LoadingRegion>
  );
}
