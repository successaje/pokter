import { LoadingRegion, Skeleton } from '@/ui/Feedback';

/**
 * Job-receipt shaped, and it has to be its own file.
 *
 * Without one, Next serves the nearest ancestor's fallback — and
 * `(site)/proofrun/loading.tsx` is shaped like the landing page: a
 * three-column explainer, a seven-row criteria list, a scenario picker.
 * A reader opening a receipt link saw all of that and then got a table
 * of checks instead, which reads as the page breaking. The leaderboard's
 * own loading file says the same thing, and this route is dynamic over a
 * chain read, so the fallback is what a visitor actually sees.
 *
 * The order below is the order the page renders in: header with its two
 * links, the provenance line, the state box, the counts, then the table.
 *
 * No placeholder figures and no placeholder outcome marks. A greyed-out
 * "Passed" would be a verdict, and on a page whose subject is what may
 * and may not be claimed, a skeleton that claims anything is the wrong
 * skeleton.
 */
export default function JobProofRunLoading() {
  return (
    <LoadingRegion label="Loading this job’s ProofRun">
      <div className="frame pb-24 pt-10 sm:pt-16">
        <div className="mb-8 flex max-w-3xl flex-col gap-3">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-12 w-full max-w-lg" />
          <Skeleton className="h-5 w-full max-w-2xl" />
          <div className="flex gap-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>

        <div className="flex flex-col gap-5">
          {/* Scenario name and the provenance chip beside it. */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-6 w-32 rounded-full" />
            </div>
            <Skeleton className="h-6 w-full max-w-md" />
            <Skeleton className="h-4 w-full max-w-2xl" />
          </div>

          {/* The state box. */}
          <Skeleton className="h-28 w-full rounded-[12px]" />

          {/* The three counts, and the freshness line opposite them. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {[0, 1, 2].map((chip) => (
                <Skeleton key={chip} className="h-9 w-28 rounded-[8px]" />
              ))}
            </div>
            <Skeleton className="h-4 w-64" />
          </div>

          {/* The checks. */}
          <div className="overflow-hidden rounded-[14px] border border-rule">
            <div className="flex gap-4 bg-sunken/70 px-3 py-3">
              {['w-24', 'w-20', 'w-28', 'w-28', 'w-24'].map((w) => (
                <Skeleton key={w} className={`h-3 ${w}`} />
              ))}
            </div>
            <div className="divide-y divide-rule bg-raised">
              {Array.from({ length: 7 }, (_, row) => (
                <div key={row} className="flex items-start gap-4 px-3 py-4">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </div>

          {/* Where the state was read, as six facts. */}
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[12px] border border-rule bg-rule sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, cell) => (
              <div key={cell} className="flex flex-col gap-2 bg-raised px-4 py-3.5">
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
