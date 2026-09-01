import Link from 'next/link';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { getComparisons, listMarketplace, type Listing } from '@/lib/marketplace';
import { CompareTable } from '@/components/compare/CompareTable';
import { cn } from '@/lib/ui/cn';

export const dynamic = 'force-dynamic';

/** §27. Up to four, because a fifth column stops being readable. */
const MAX_AGENTS = 4;

function keyFor(listing: Listing): string {
  return `${listing.agent.chain_id}:${listing.agent.token_id}`;
}

function parseSelection(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  const value = Array.isArray(raw) ? raw.join(',') : raw;
  return [...new Set(value.split(',').filter(Boolean))].slice(0, MAX_AGENTS);
}

/** The URL after toggling one agent in or out of the selection. */
function toggleHref(selected: string[], key: string): string {
  const next = selected.includes(key)
    ? selected.filter((entry) => entry !== key)
    : [...selected, key].slice(0, MAX_AGENTS);

  return next.length === 0 ? '/compare' : `/compare?agents=${next.join(',')}`;
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const selected = parseSelection(params.agents);

  const [sections, entries] = await Promise.all([
    listMarketplace({ limit: 4 }),
    getComparisons(selected),
  ]);

  const full = selected.length >= MAX_AGENTS;

  return (
    <div className="flex flex-col gap-10 pt-6">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Compare
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Put up to {MAX_AGENTS} agents side by side. The best value in each row
          is highlighted — but only where more than one agent has data to
          compare.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-8 text-center text-xs text-[color:var(--text-faint)]">
          Pick two or more agents below to compare them.
        </p>
      ) : (
        <CompareTable entries={entries} />
      )}

      <section className="flex flex-col gap-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[color:var(--border)] pb-3">
          <h2 className="text-base font-medium tracking-tight">Choose agents</h2>
          <p className="text-[11px] text-[color:var(--text-faint)]">
            {selected.length} of {MAX_AGENTS} selected
            {full && ' · deselect one to swap'}
          </p>
        </div>

        {sections.map(({ category, listings }) => {
          const meta = CATEGORY_BY_ID.get(category);
          if (!meta || listings.length === 0) return null;

          return (
            <div key={category} className="flex flex-col gap-2.5">
              <h3 className="text-xs text-[color:var(--text-muted)]">
                {meta.label}
              </h3>
              <div className="flex flex-wrap gap-2">
                {listings.map((listing) => {
                  const key = keyFor(listing);
                  const isSelected = selected.includes(key);
                  // A full selection still allows deselecting, never adding.
                  const disabled = full && !isSelected;

                  return disabled ? (
                    <span
                      key={key}
                      aria-disabled
                      className="cursor-not-allowed rounded-[var(--radius)] border border-[color:var(--border)] px-3 py-2 text-[12px] text-[color:var(--text-faint)] opacity-50"
                    >
                      {listing.agent.name}
                    </span>
                  ) : (
                    <Link
                      key={key}
                      href={toggleHref(selected, key)}
                      scroll={false}
                      className={cn(
                        'rounded-[var(--radius)] border px-3 py-2 text-[12px] transition-colors',
                        isSelected
                          ? 'border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] text-[color:var(--text)]'
                          : 'border-[color:var(--border)] text-[color:var(--text-muted)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text)]',
                      )}
                    >
                      {isSelected && (
                        <span aria-hidden className="mr-1.5 text-[color:var(--positive)]">
                          ✓
                        </span>
                      )}
                      {listing.agent.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
