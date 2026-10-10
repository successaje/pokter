import { Mark } from '@/shell/Logo';
import { LoadingRegion, Skeleton } from '@/ui/Feedback';

/** The hire page re-checks the agent live before offering terms. */
export default function HireLoading() {
  return (
    <LoadingRegion label="Checking the agent before you hire">
      <div className="flex h-14 items-center gap-2.5 border-b border-rule px-4 sm:px-6">
        <Mark size={20} />
        <span className="text-[15px] font-semibold">Hire</span>
      </div>
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-8 sm:px-6 md:grid-cols-[220px_minmax(0,1fr)] md:py-12">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-[10px]" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex max-w-2xl flex-col gap-4">
          <p className="text-sm text-ink-3">Checking that the agent answers and who would be paid…</p>
          <Skeleton className="h-8 w-80 max-w-full" />
          <div className="grid gap-2 sm:grid-cols-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </LoadingRegion>
  );
}
