import { StatusState } from '@/components/ui/States';
import Link from 'next/link';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import { CATEGORIES, CATEGORY_BY_ID } from '@/lib/agents/categories';
import type { listSearchable } from '@/lib/marketplace';
import { offersDirectHire, verdictFor } from '@/lib/search/match';

type Searchable = Awaited<ReturnType<typeof listSearchable>>[number];

export function ExploreMarketplace({
  agents,
  selectedCategory,
}: {
  agents: Searchable[];
  selectedCategory: string | null;
}) {
  const filtered = agents.filter((entry) => {
    if (selectedCategory && entry.listing.category !== selectedCategory) return false;
    const published = `${entry.listing.agent.name} ${entry.listing.agent.description ?? ''}`.toLowerCase();
    return !published.includes('test deployment') && !published.includes('retired duplicate');
  });
  const ranked = [...filtered].sort((a, b) => {
    const aRatio = a.record.totalProbes
      ? a.record.totalAnswered / a.record.totalProbes
      : -1;
    const bRatio = b.record.totalProbes
      ? b.record.totalAnswered / b.record.totalProbes
      : -1;
    return (
      Number(offersDirectHire(b)) - Number(offersDirectHire(a)) ||
      bRatio - aRatio ||
      b.record.totalProbes - a.record.totalProbes ||
      b.listing.attestationCount - a.listing.attestationCount
    );
  });

  return (
    <section aria-labelledby="explore-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--brand)]">
            Explore the marketplace
          </p>
          <h2 id="explore-title" className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
            Agents with evidence you can inspect.
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[color:var(--text-muted)]">
            Start browsing now. Open the recommendation studio only when you
            want Pokter to narrow the market around your capital and risk.
          </p>
        </div>
        <Link href="/agents" className="tap text-xs font-medium text-[color:var(--info)] sm:min-h-0">
          View full catalog <span aria-hidden className="ml-1">→</span>
        </Link>
      </div>

      <nav aria-label="Filter marketplace by outcome" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:px-0">
        <Link
          href="/discover#explore"
          className={`tap inline-flex shrink-0 items-center rounded-full border px-4 text-xs font-medium sm:min-h-9 ${!selectedCategory ? 'border-[color:var(--brand)] bg-[color:var(--brand)] text-[color:var(--brand-ink)]' : 'border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-muted)]'}`}
        >
          All agents
        </Link>
        {CATEGORIES.map((category) => (
          <Link
            key={category.id}
            href={`/discover?category=${category.id}#explore`}
            className={`tap inline-flex shrink-0 items-center rounded-full border px-4 text-xs font-medium sm:min-h-9 ${selectedCategory === category.id ? 'border-[color:var(--brand)] bg-[color:var(--brand)] text-[color:var(--brand-ink)]' : 'border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-muted)] hover:border-[color:var(--border-strong)]'}`}
          >
            {category.label}
          </Link>
        ))}
      </nav>

      <div id="explore" className="scroll-mt-24 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ranked.slice(0, 8).map((entry) => {
          const { agent } = entry.listing;
          const category = CATEGORY_BY_ID.get(entry.listing.category);
          const ratio = entry.record.totalProbes
            ? Math.round((entry.record.totalAnswered / entry.record.totalProbes) * 100)
            : null;

          return (
            <article
              key={`${agent.chain_id}:${agent.token_id}`}
              className="group flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[color:var(--border-strong)] hover:shadow-[0_12px_35px_rgba(0,0,0,0.08)]"
            >
              <Link href={`/agents/${agent.chain_id}/${agent.token_id}`} className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <AgentAvatar name={agent.name} src={agent.image_url} size="lg" />
                  <EvidenceBadge verdict={verdictFor(entry)} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-faint)]">
                    {category?.label ?? 'Agent'}
                  </p>
                  <h3 title={agent.name} className="mt-1 line-clamp-2 text-sm font-semibold leading-snug [overflow-wrap:anywhere]">
                    {agent.name}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                    {agent.description?.trim() || 'No description published.'}
                  </p>
                </div>
                <dl className="mt-auto grid grid-cols-2 gap-2 border-t border-[color:var(--border)] pt-3">
                  <div>
                    <dt className="text-[9px] uppercase tracking-wide text-[color:var(--text-faint)]">Observed</dt>
                    <dd className="tabular mt-0.5 text-[11px] font-medium">
                      {ratio === null ? 'Not measured' : `${ratio}% · ${entry.record.totalProbes} probes`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[9px] uppercase tracking-wide text-[color:var(--text-faint)]">Receipts</dt>
                    <dd className="tabular mt-0.5 text-[11px] font-medium">{entry.listing.attestationCount}</dd>
                  </div>
                </dl>
              </Link>
              <div className="flex items-center gap-2 border-t border-[color:var(--border)] px-4 py-3">
                <Link href={`/agents/${agent.chain_id}/${agent.token_id}`} className="tap flex flex-1 items-center text-[11px] font-medium text-[color:var(--text-secondary)] md:min-h-9">
                  Review evidence
                </Link>
                {offersDirectHire(entry) && (
                  <Link href={`/hire/${agent.chain_id}/${agent.token_id}`} className="action-primary tap inline-flex items-center rounded-[var(--radius)] px-3 text-[11px] font-semibold md:min-h-9">
                    Hire
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {ranked.length === 0 && (
        <StatusState body="No indexed agents currently match this category." />
      )}
    </section>
  );
}
