import type { Metadata } from 'next';
import { StatusState } from '@/components/ui/States';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { getComparisons, listSearchable, type Listing } from '@/lib/marketplace';
import { CompareTable } from '@/components/compare/CompareTable';
import { AgentPicker, type PickerOption } from '@/components/compare/AgentPicker';
import { isPromotableAgent } from '@/lib/agents/eligibility';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Compare agents',
  description:
    'Compare BNB Chain agents side by side using measured reliability, evidence coverage and onchain identity.',
};

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

  const [searchable, entries] = await Promise.all([
    listSearchable({ limit: 30 }),
    getComparisons(selected),
  ]);

  const pickerOptions = searchable
    .map(({ listing }) => listing)
    .filter((listing) => isPromotableAgent(listing.agent))
    .map((listing): PickerOption => ({
      key: keyFor(listing),
      name: listing.agent.name,
      imageUrl: listing.agent.image_url ?? null,
      description: listing.agent.description?.trim() || 'No description published.',
      category: listing.category,
      categoryLabel: CATEGORY_BY_ID.get(listing.category)?.label ?? 'Other',
    }));

  // An explicitly shared comparison remains reproducible even when it
  // contains a test or retired identity. Such identities are omitted only
  // from the default chooser, never hidden from a deliberate inspection.
  for (const entry of entries) {
    const key = `${entry.agent.chain_id}:${entry.agent.token_id}`;
    if (pickerOptions.some((option) => option.key === key)) continue;
    const meta =
      entry.category === 'unclassified'
        ? null
        : CATEGORY_BY_ID.get(entry.category);
    pickerOptions.push({
      key,
      name: entry.agent.name,
      imageUrl: entry.agent.image_url ?? null,
      description: entry.agent.description?.trim() || 'No description published.',
      category: entry.category,
      categoryLabel: meta?.label ?? 'Other',
    });
  }


  return (
    <div className="flex flex-col gap-10 pt-6">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Compare
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Put up to {MAX_AGENTS} agents side by side. The strongest value in
          each row is marked, but only where more than one agent has data to
          compare — and a score reflects the evidence that exists, not a
          promise about what happens next.
        </p>
      </header>

      <AgentPicker
        options={pickerOptions}
        selected={selected}
        max={MAX_AGENTS}
      />

      {entries.length < 2 ? (
        <StatusState
          title={
            entries.length === 0
              ? 'Choose your first two agents above.'
              : 'Choose one more agent to start comparing.'
          }
          body="Evidence, reliability, score and ownership will appear side by side."
        />
      ) : (
        <CompareTable entries={entries} />
      )}
    </div>
  );
}
