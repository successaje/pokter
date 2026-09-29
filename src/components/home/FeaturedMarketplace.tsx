import Link from 'next/link';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import type { Listing } from '@/lib/marketplace';

export function FeaturedMarketplace({
  sections,
}: {
  sections: { category: Category; listings: Listing[] }[];
}) {
  const featured = sections
    .map(({ category, listings }) => ({
      category,
      listing: listings.find((listing) => {
        const published = `${listing.agent.name} ${listing.agent.description ?? ''}`.toLowerCase();
        return (
          !published.includes('test deployment') &&
          !published.includes('retired duplicate')
        );
      }),
    }))
    .filter(
      (entry): entry is { category: Category; listing: Listing } =>
        Boolean(entry.listing),
    );

  /*
   * Counted, not asserted.
   *
   * The heading said "Four outcomes" while the list above it drops any
   * category whose only listings are test deployments or retired duplicates.
   * A registry change that left one category unrepresented would have printed
   * a headline contradicted by the three cards directly beneath it — on a page
   * whose argument is that Pokter states only what it can show.
   */
  const spelled =
    (['no', 'One', 'Two', 'Three', 'Four'] as const)[featured.length] ??
    String(featured.length);

  return (
    <section className="flex flex-col gap-6" aria-labelledby="featured-agents-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--brand)]">
            Start with an agent
          </p>
          <h2 id="featured-agents-title" className="display mt-2 text-3xl sm:text-4xl">
            {spelled} outcome{featured.length === 1 ? '' : 's'}. {spelled}{' '}
            evidence trail{featured.length === 1 ? '' : 's'}.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">
            Open a leading agent from each financial role, or let Pokter narrow
            the market around your objective and risk.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/discover"
            className="action-primary inline-flex min-h-10 items-center rounded-[var(--radius)] px-4 text-[12px] font-semibold"
          >
            Find my best match
          </Link>
          <Link
            href="/agents"
            className="inline-flex min-h-10 items-center rounded-[var(--radius)] border border-[color:var(--border-strong)] px-4 text-[12px] font-medium"
          >
            Browse marketplace
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {featured.map(({ category, listing }) => {
          const meta = CATEGORY_BY_ID.get(category);
          const href = `/agents/${listing.agent.chain_id}/${listing.agent.token_id}`;

          return (
            <Link
              key={`${listing.agent.chain_id}:${listing.agent.token_id}`}
              href={href}
              className="group flex min-w-0 flex-col gap-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[color:var(--brand)] hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <AgentAvatar
                  name={listing.agent.name}
                  src={listing.agent.image_url}
                  size="lg"
                />
                <span className="rounded-full bg-[color:var(--brand-highlight-soft)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-[color:var(--brand-strong)]">
                  {meta?.label ?? 'Agent'}
                </span>
              </div>
              <div className="min-w-0">
                <h3 className="line-clamp-2 text-sm font-semibold leading-snug [overflow-wrap:anywhere]">
                  {listing.agent.name}
                </h3>
                <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                  {listing.agent.description?.trim() || 'No description published.'}
                </p>
              </div>
              <div className="mt-auto flex items-center justify-between gap-3 border-t border-[color:var(--border)] pt-3 text-[10px]">
                <span className="text-[color:var(--text-faint)]">
                  {listing.attestationCount > 0
                    ? `${listing.attestationCount} onchain ${listing.attestationCount === 1 ? 'receipt' : 'receipts'}`
                    : 'Registry identity'}
                </span>
                <span className="font-semibold text-[color:var(--text-secondary)] group-hover:text-[color:var(--brand-strong)]">
                  Review →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
