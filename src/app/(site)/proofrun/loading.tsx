import { LoadingRegion, Skeleton } from '@/ui/Feedback';

/**
 * ProofRun-shaped, in the order the page renders: header, the three
 * outcomes, the criteria list, the two scenario groups with the runner
 * beneath, then the pair of binding examples.
 *
 * No placeholder figures and no placeholder outcome marks. A greyed-out
 * "Passed" would be a verdict, and on a page whose subject is what may and
 * may not be claimed, a skeleton that claims anything is the wrong
 * skeleton.
 */
export default function ProofRunLoading() {
  return (
    <LoadingRegion label="Loading ProofRun">
      <div className="frame pb-24 pt-10 sm:pt-16">
        <div className="flex max-w-3xl flex-col gap-4 border-b border-rule pb-10">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-14 w-full max-w-2xl" />
          <Skeleton className="h-5 w-full max-w-xl" />
          <Skeleton className="h-5 w-4/5 max-w-lg" />
        </div>

        <div className="border-b border-rule py-10">
          <Skeleton className="h-8 w-full max-w-md" />
          <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
          <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-rule bg-rule sm:grid-cols-3">
            {[0, 1, 2].map((cell) => (
              <div key={cell} className="flex flex-col gap-2 bg-raised p-5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
            ))}
          </div>
        </div>

        <div className="border-b border-rule py-10">
          <Skeleton className="h-8 w-full max-w-sm" />
          <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
          <div className="mt-6 ruled overflow-hidden rounded-[14px] border border-rule">
            {Array.from({ length: 7 }, (_, row) => (
              <div key={row} className="flex items-start gap-3 bg-raised px-4 py-4">
                <Skeleton className="h-3.5 w-6" />
                <Skeleton className="h-3.5 w-full max-w-sm" />
              </div>
            ))}
          </div>
        </div>

        <div className="border-b border-rule py-10">
          <Skeleton className="h-8 w-32" />
          <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-rule bg-rule sm:grid-cols-2">
            {[0, 1].map((cell) => (
              <div key={cell} className="flex flex-col gap-2 bg-raised p-4">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-col gap-4 rounded-[14px] border border-rule bg-raised p-6">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-6 w-48" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, card) => (
                <Skeleton key={card} className="h-24 w-full rounded-[11px]" />
              ))}
            </div>
            <Skeleton className="h-10 w-40 rounded-[9px]" />
            <Skeleton className="h-32 w-full rounded-[14px]" />
          </div>
        </div>

        <div className="py-10">
          <Skeleton className="h-8 w-full max-w-lg" />
          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
            {[0, 1].map((panel) => (
              <Skeleton key={panel} className="h-80 w-full rounded-[14px]" />
            ))}
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
