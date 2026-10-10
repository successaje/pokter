import { LoadingRegion, Skeleton } from '@/ui/Feedback';

/** Discover-shaped: header, search, filter column and a grid of cards. */
export default function DiscoverLoading() {
  return (
    <LoadingRegion label="Loading agents">
      <div className="frame pb-24 pt-8 sm:pt-12">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-3 h-5 w-full max-w-xl" />
        <Skeleton className="mt-6 h-14 w-full rounded-[14px]" />
        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[232px_minmax(0,1fr)]">
          <div className="hidden flex-col gap-2 lg:flex">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
          <div>
            <Skeleton className="mb-4 h-9 w-full" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="flex flex-col gap-3 rounded-[14px] border border-rule bg-raised p-5">
                  <div className="flex gap-3">
                    <Skeleton className="size-11 rounded-[10px]" />
                    <div className="flex flex-1 flex-col gap-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="mt-3 h-4 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
