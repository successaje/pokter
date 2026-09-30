import { StatusState } from '@/components/ui/States';
import Link from 'next/link';

import { MarketplaceListing } from '@/components/discover/MarketplaceListing';
import { CATEGORIES, CATEGORY_BY_ID } from '@/lib/agents/categories';
import type { listSearchable } from '@/lib/marketplace';
import { offersDirectHire, verdictFor } from '@/lib/search/match';
import { isPromotableAgent } from '@/lib/agents/eligibility';

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
    return isPromotableAgent(entry.listing.agent);
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
          {/*
            "Agents with evidence you can inspect" sat here, about five hundred
            pixels under a page title reading "Explore agents. Inspect the
            evidence." Two near-identical sentences on one screen read as a
            template rather than as a thought. The page title keeps the claim;
            this keeps the one fact the title does not carry, which is what the
            list excludes.
          */}
          <h2 id="explore-title" className="text-xl font-semibold tracking-tight sm:text-2xl">
            Production candidates
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[color:var(--text-muted)]">
            Ranked on what has been observed, not what was declared. Test and
            retired identities stay in the full catalogue and are never
            promoted here.
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
          All candidates
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

      {/*
        Mapped to plain rows before crossing to the client. The listing owns a
        layout preference and nothing else, so it has no business receiving
        whole dossiers to render two numbers from.
      */}
      <div id="explore" className="scroll-mt-24">
        <MarketplaceListing
          rows={ranked.map((entry) => {
            const { agent } = entry.listing;
            const ratio = entry.record.totalProbes
              ? Math.round(
                  (entry.record.totalAnswered / entry.record.totalProbes) * 100,
                )
              : null;

            return {
              key: `${agent.chain_id}:${agent.token_id}`,
              href: `/agents/${agent.chain_id}/${agent.token_id}`,
              hireHref: offersDirectHire(entry)
                ? `/hire/${agent.chain_id}/${agent.token_id}`
                : null,
              name: agent.name,
              imageUrl: agent.image_url,
              categoryLabel:
                CATEGORY_BY_ID.get(entry.listing.category)?.label ?? 'Agent',
              description:
                agent.description?.trim() || 'No description published.',
              verdict: verdictFor(entry),
              observed:
                ratio === null
                  ? 'Not measured'
                  : `${ratio}% · ${entry.record.totalProbes} probes`,
              receipts: entry.listing.attestationCount,
            };
          })}
        />
      </div>

      {ranked.length === 0 && (
        <StatusState body="No indexed agents currently match this category." />
      )}
    </section>
  );
}
