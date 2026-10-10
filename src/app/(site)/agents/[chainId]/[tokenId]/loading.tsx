import { LoadingRegion, Skeleton } from '@/ui/Feedback';

/**
 * Agent-profile-shaped, because this page runs a live check of the agent's
 * endpoint before it renders, and that can take several seconds. The steps
 * named are the ones actually happening on the server.
 */
export default function AgentLoading() {
  return (
    <LoadingRegion label="Checking this agent">
      <div className="border-b border-rule bg-raised/50">
        <div className="frame pb-8 pt-6">
          <Skeleton className="h-4 w-48" />
          <div className="mt-6 flex gap-5">
            <Skeleton className="size-[76px] rounded-[16px]" />
            <div className="flex flex-1 flex-col gap-3">
              <Skeleton className="h-9 w-72 max-w-full" />
              <Skeleton className="h-4 w-60" />
              <div className="flex gap-2">
                <Skeleton className="h-7 w-24 rounded-full" />
                <Skeleton className="h-7 w-36 rounded-full" />
              </div>
            </div>
          </div>
          <Skeleton className="mt-6 h-5 w-full max-w-2xl" />
        </div>
      </div>
      <div className="frame grid gap-12 pt-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <ol className="flex flex-col gap-2 rounded-[12px] border border-rule bg-raised p-5 text-[13px] text-ink-3">
            {['Reading its ERC-8004 identity', 'Probing its endpoint', 'Loading its probe history', 'Retrieving published evidence'].map((step, i) => (
              <li key={step} className="flex items-center gap-3">
                <span className="size-1.5 rounded-full bg-ink-3 pulse" style={{ animationDelay: `${i * 200}ms` }} aria-hidden />
                {step}
              </li>
            ))}
          </ol>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
        <Skeleton className="hidden h-96 w-full rounded-[16px] lg:block" />
      </div>
    </LoadingRegion>
  );
}
