import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { listCategory } from '@/lib/marketplace';
import { AgentCard } from '@/components/AgentCard';

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

/**
 * §18. Category-specific metrics.
 *
 * Each category is judged on what matters for that job — a health-factor
 * monitor lives or dies on response time, a grid bot on execution. These are
 * the questions the page commits to answering, and where the data does not yet
 * exist the page says so rather than substituting a generic metric.
 */
const FOCUS: Record<Category, string[]> = {
  rebalancing: [
    'LP range management',
    'Position maintenance',
    'Rebalance frequency',
    'Gas efficiency',
  ],
  'grid-trading': [
    'Execution success',
    'Trading frequency',
    'Strategy period',
    'Range discipline',
  ],
  yield: [
    'Risk-adjusted yield',
    'Protocol exposure',
    'Capital efficiency',
    'Withdrawal constraints',
  ],
  'health-factor': [
    'Response time',
    'Alert accuracy',
    'Monitored positions',
    'Intervention history',
  ],
};

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: raw } = await params;
  const meta = CATEGORY_BY_ID.get(raw as Category);
  if (!meta) notFound();

  const listings = await listCategory(meta.id, { limit: 16 });
  const withEvidence = listings.filter((l) => l.attestationCount > 0);

  return (
    <div className="flex flex-col gap-10 pt-6">
      <Link
        href="/agents"
        className="text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
      >
        ← All agents
      </Link>

      <header className="flex max-w-3xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {meta.label}
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          {meta.blurb}
        </p>
        <p className="text-sm italic text-[color:var(--text-muted)]">
          {meta.question}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
          <p className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
            Indexed
          </p>
          <p className="tabular mt-1 text-2xl">{listings.length}</p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
          <p className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
            With on-chain evidence
          </p>
          <p className="tabular mt-1 text-2xl">{withEvidence.length}</p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
          <p className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
            Judged on
          </p>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {FOCUS[meta.id].map((item) => (
              <li key={item} className="text-[11px] text-[color:var(--text-muted)]">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {listings.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-8 text-center text-xs text-[color:var(--text-faint)]">
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
    </div>
  );
}
