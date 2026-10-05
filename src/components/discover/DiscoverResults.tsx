import Link from 'next/link';

import { BackButton } from '@/components/navigation/BackButton';
import { DiscoverCategorySelect } from '@/components/discover/DiscoverCategorySelect';
import { MarketplaceListing, type ListingRow } from '@/components/discover/MarketplaceListing';
import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { isPromotableAgent } from '@/lib/agents/eligibility';
import { rankForBrief } from '@/lib/brief/rank';
import type { TrackRecord } from '@/lib/history/record';
import type { Listing } from '@/lib/marketplace';
import { offersDirectHire, verdictFor } from '@/lib/search/match';

type Entry = { listing: Listing; record: TrackRecord };
type EvidenceFilter = 'answering' | 'priced' | 'attested' | 'reliable';

const EVIDENCE_FILTERS: { id: EvidenceFilter; label: string }[] = [
  { id: 'answering', label: 'Has answered probes' },
  { id: 'priced', label: 'Has signed price' },
  { id: 'attested', label: 'Has attestations' },
  { id: 'reliable', label: 'Answers its probes' },
];

function hrefFor(intent: string, category: string | null, evidence: string | null) {
  const params = new URLSearchParams({ intent });
  if (category) params.set('category', category);
  if (evidence) params.set('evidence', evidence);
  return `/discover?${params.toString()}#results`;
}

function toRow(entry: Entry): ListingRow {
  const { agent } = entry.listing;
  const ratio = entry.record.totalProbes
    ? Math.round((entry.record.totalAnswered / entry.record.totalProbes) * 100)
    : null;
  return {
    key: `${agent.chain_id}:${agent.token_id}`,
    href: `/agents/${agent.chain_id}/${agent.token_id}`,
    hireHref: offersDirectHire(entry) ? `/agents/${agent.chain_id}/${agent.token_id}?hire=1` : null,
    name: agent.name,
    imageUrl: agent.image_url,
    categoryLabel: CATEGORY_BY_ID.get(entry.listing.category)?.label ?? 'Agent',
    description: agent.description?.trim() || 'No description published.',
    verdict: verdictFor(entry),
    observed: ratio === null ? 'Not measured' : `${ratio}% · ${entry.record.totalProbes} probes`,
    receipts: entry.listing.attestationCount,
  };
}

export function DiscoverResults({ entries, intent, selectedCategory, evidence }: { entries: Entry[]; intent: string; selectedCategory: Category | null; evidence: string | null }) {
  const ranked = rankForBrief(intent, entries, entries.length);
  const promotable = ranked.results.filter((entry) => isPromotableAgent(entry.listing.agent));
  const filtered = promotable.filter((entry) => {
    if (selectedCategory && entry.listing.category !== selectedCategory) return false;
    if (evidence === 'answering' && entry.record.totalAnswered === 0) return false;
    if (evidence === 'priced' && entry.listing.quote == null) return false;
    if (evidence === 'attested' && entry.listing.attestationCount === 0) return false;
    if (evidence === 'reliable' && verdictFor(entry) !== 'reliable') return false;
    return true;
  });

  return (
    <section id="results" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <BackButton />
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[11px] text-[color:var(--text-faint)]">
          <Link href="/discover" className="hover:text-[color:var(--text)]">Discover</Link><span aria-hidden>›</span><span className="text-[color:var(--text-muted)]">Search</span>
        </nav>
      </div>

      <header>
        <h1 className="font-[family-name:var(--font-serif)] text-2xl sm:text-3xl">Results for “{intent}”</h1>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">{filtered.length} production candidate{filtered.length === 1 ? '' : 's'} found</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="discover-filter-panel flex flex-col gap-4 rounded-2xl border border-[color:var(--border)] p-4 lg:sticky lg:top-24 lg:self-start" aria-label="Search filters">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Refine results</h2>
            {(selectedCategory || evidence) && <Link href={hrefFor(intent, null, null)} className="text-[10px] font-medium text-[color:var(--info)]">Clear</Link>}
          </div>
          <DiscoverCategorySelect intent={intent} selectedCategory={selectedCategory} evidence={evidence} />
          <details className="group border-t border-[color:var(--border)] pt-1">
            <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-xs font-semibold">Evidence <span className="transition-transform group-open:rotate-180">⌄</span></summary>
            <div className="flex flex-col gap-1 pb-3">
              <Link href={hrefFor(intent, selectedCategory, null)} className={`rounded-lg px-2.5 py-2 text-[11px] ${!evidence ? 'bg-[color:var(--brand)]/10 font-medium' : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)]'}`}>Any evidence state</Link>
              {EVIDENCE_FILTERS.map((filter) => <Link key={filter.id} href={hrefFor(intent, selectedCategory, filter.id)} className={`rounded-lg px-2.5 py-2 text-[11px] ${evidence === filter.id ? 'bg-[color:var(--brand)]/10 font-medium' : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)]'}`}>{filter.label}</Link>)}
            </div>
          </details>
        </aside>

        <div className="min-w-0">
          <form action="/discover" className="mb-5 flex items-center gap-2 rounded-xl border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-2 focus-within:border-[color:var(--brand)]">
            <svg viewBox="0 0 24 24" aria-hidden className="ml-2 size-4 fill-none stroke-[color:var(--text-muted)]" strokeWidth="1.8"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
            <label htmlFor="result-intent" className="sr-only">Search agents</label>
            <input id="result-intent" name="intent" defaultValue={intent} className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none" />
            <button type="submit" className="action-primary rounded-lg px-4 py-2 text-xs font-semibold">Search</button>
          </form>

          {filtered.length > 0 ? <MarketplaceListing rows={filtered.map(toRow)} /> : (
            <div className="rounded-2xl border border-dashed border-[color:var(--border-strong)] p-8 text-center"><h2 className="text-base font-semibold">No candidates match these filters.</h2><p className="mt-2 text-xs text-[color:var(--text-muted)]">Try clearing one filter. Pokter will not invent evidence to fill the grid.</p><Link href={hrefFor(intent, null, null)} className="mt-4 inline-flex text-xs font-medium text-[color:var(--info)] underline decoration-dotted underline-offset-2">Clear filters</Link></div>
          )}
        </div>
      </div>
    </section>
  );
}
