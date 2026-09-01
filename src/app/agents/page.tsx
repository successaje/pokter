import { Suspense } from 'react';

import { CATEGORIES, CATEGORY_BY_ID } from '@/lib/agents/categories';
import { listSearchable } from '@/lib/marketplace';
import { parseQuery } from '@/lib/search/query';
import { matchesQuery } from '@/lib/search/match';
import { AgentCard } from '@/components/AgentCard';
import { AgentSearch } from '@/components/search/AgentSearch';

/**
 * Rendered per request rather than pre-built.
 *
 * Static generation ran each page in its own worker with no shared fetch cache,
 * so every page independently re-queried a rate-limited registry and the build
 * repeatedly blew past its 60s budget. Pre-rendering bought little anyway: this
 * data is live and revalidates every two minutes regardless.
 *
 * Responses are still cached at the fetch layer, so only the first request
 * after a revalidation window pays for the lookup. Setting SCAN_API_KEY lifts
 * the rate limit from 30 to 3,000 requests a minute and makes this moot.
 */
export const dynamic = 'force-dynamic';

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = typeof params.q === 'string' ? params.q : '';
  const query = parseQuery(raw);

  const all = await listSearchable({ limit: 8 });
  const matched = query.qualifiers.length
    ? all.filter((agent) => matchesQuery(agent, query))
    : all;

  const byCategory = CATEGORIES.map(({ id }) => ({
    category: id,
    entries: matched.filter((entry) => entry.listing.category === id),
  }));

  const filtering = query.qualifiers.length > 0;

  return (
    <div className="flex flex-col gap-8 pt-6">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Agents</h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          {all.length} agents indexed across {CATEGORIES.length} categories.
          Filter on what has been observed — <span className="mono">is:proven</span>,{' '}
          <span className="mono">has:probes&gt;10</span> — not just on what
          publishers claim.
        </p>
      </header>

      <Suspense fallback={<div className="h-28" />}>
        <AgentSearch resultCount={matched.length} />
      </Suspense>

      {matched.length === 0 ? (
        /* §60. An honest empty state, naming the filter that produced it. */
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-strong)] p-8 text-center">
          <p className="text-sm font-medium">No agent matches these filters.</p>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-[color:var(--text-muted)]">
            {all.length} agents are indexed. Loosening the evidence requirement
            widens the set — it does not create evidence that is missing.
          </p>
        </div>
      ) : (
        byCategory.map(({ category, entries }) => {
          const meta = CATEGORY_BY_ID.get(category);
          if (!meta) return null;
          // When filtering, an empty category is a result, not a gap to fill.
          if (filtering && entries.length === 0) return null;

          return (
            <section key={category} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[color:var(--border)] pb-3">
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-medium tracking-tight">{meta.label}</h2>
                  <p className="text-xs text-[color:var(--text-muted)]">{meta.blurb}</p>
                </div>
                <p className="tabular text-[11px] text-[color:var(--text-faint)]">
                  {entries.length} {filtering ? 'matching' : 'indexed'}
                </p>
              </div>

              {entries.length === 0 ? (
                <p className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-6 text-center text-xs text-[color:var(--text-faint)]">
                  No agent in the registry currently matches this category with
                  enough confidence to list.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {entries.map(({ listing }) => (
                    <AgentCard key={listing.agent.token_id} listing={listing} />
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
