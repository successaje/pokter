import type { CategoryMeta } from '@/lib/agents/categories';
import type { Listing } from '@/lib/marketplace';
import { AgentCard } from './AgentCard';

/**
 * One category section. Every category renders through this component with the
 * same weight and the same layout — no category is a headline and none is a
 * footnote.
 */
export function CategoryRail({
  meta,
  listings,
}: {
  meta: CategoryMeta;
  listings: Listing[];
}) {
  const proven = listings.filter((l) => l.attestationCount > 0).length;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[color:var(--border)] pb-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-medium tracking-tight">{meta.label}</h2>
          <p className="text-xs text-[color:var(--muted)]">{meta.blurb}</p>
        </div>
        <p className="tabular text-[11px] text-[color:var(--muted-dim)]">
          {listings.length} listed · {proven} with a record
        </p>
      </header>

      <p className="text-xs italic text-[color:var(--muted-dim)]">{meta.question}</p>

      {listings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[color:var(--border)] p-6 text-center text-xs text-[color:var(--muted-dim)]">
          No agent in the registry currently matches this category with enough
          confidence to list.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {listings.map((listing) => (
            <AgentCard key={listing.agent.token_id} listing={listing} />
          ))}
        </div>
      )}
    </section>
  );
}
