import { CATEGORIES, CATEGORY_BY_ID } from '@/lib/agents/categories';
import { listMarketplace } from '@/lib/marketplace';
import { AgentCard } from '@/components/AgentCard';

export const revalidate = 120;

/**
 * §17. Browse everything, grouped by category.
 *
 * Categories render in a fixed order through one component so the page cannot
 * drift into treating any of them as the headline.
 */
export default async function AgentsPage() {
  const sections = await listMarketplace({ limit: 8 });
  const total = sections.reduce((sum, s) => sum + s.listings.length, 0);

  return (
    <div className="flex flex-col gap-12 pt-6">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Agents
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          {total} agent{total === 1 ? '' : 's'} indexed across{' '}
          {CATEGORIES.length} financial categories, filtered from the ERC-8004
          registry and classified by what they actually do.
        </p>
      </header>

      {sections.map(({ category, listings }) => {
        const meta = CATEGORY_BY_ID.get(category);
        if (!meta) return null;

        return (
          <section key={category} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[color:var(--border)] pb-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-medium tracking-tight">
                  {meta.label}
                </h2>
                <p className="text-xs text-[color:var(--text-muted)]">
                  {meta.blurb}
                </p>
              </div>
              <p className="tabular text-[11px] text-[color:var(--text-faint)]">
                {listings.length} indexed
              </p>
            </div>

            {listings.length === 0 ? (
              <p className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-6 text-center text-xs text-[color:var(--text-faint)]">
                No agent in the registry currently matches this category with
                enough confidence to list.
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
      })}
    </div>
  );
}
