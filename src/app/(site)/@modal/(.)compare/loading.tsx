import { CompareSheet } from '@/features/compare/CompareSheet';
import { Skeleton } from '@/ui/Feedback';

/*
 * The sheet opens on the click, and fills in when the comparison arrives.
 * Building one reads the registry, attestations and owner for every agent,
 * about a second in production, and with nothing shown until then the
 * click looked like it had not registered.
 */
export default function LoadingCompare() {
  return (
    <CompareSheet fullPageHref={null}>
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading the comparison">
        <Skeleton className="h-24 w-full" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </CompareSheet>
  );
}
