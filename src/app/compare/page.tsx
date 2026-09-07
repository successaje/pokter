import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { getComparisons, listMarketplace, type Listing } from '@/lib/marketplace';
import { CompareTable } from '@/components/compare/CompareTable';
import { AgentPicker, type PickerOption } from '@/components/compare/AgentPicker';

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

      <AgentPicker
        options={sections.flatMap(({ category, listings }) => {
          const meta = CATEGORY_BY_ID.get(category);
          return meta
            ? listings.map(
                (listing): PickerOption => ({
                  key: keyFor(listing),
                  name: listing.agent.name,
                  category,
                  categoryLabel: meta.label,
                }),
              )
            : [];
        })}
        selected={selected}
        max={MAX_AGENTS}
      />

    </div>
  );
}
