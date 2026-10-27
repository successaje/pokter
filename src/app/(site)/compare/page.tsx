import type { Metadata } from 'next';

import { CompareView } from '@/features/compare/CompareView';
import { loadComparison } from '@/features/compare/load';
import { BackLink } from '@/ui/BackLink';
import { LinkButton } from '@/ui/Button';
import { EmptyState } from '@/ui/Feedback';

export const metadata: Metadata = {
  title: 'Compare agents',
  description: 'Compare up to four agents side by side on evidence, availability, price and delivered work.',
};
export const dynamic = 'force-dynamic';

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { items, images } = await loadComparison((await searchParams).agents);

  return (
    /* The agents' row sticks under the site header, which is 56px and a rule once the page has scrolled. */
    <div className="frame pb-24 pt-10 [--compare-top:57px] sm:pt-14">
      <header className="mb-10 flex max-w-2xl flex-col gap-3">
        <BackLink fallback="/discover" />
        <h1 className="t-h1">Compare agents</h1>
        <p className="t-body text-ink-2">Side by side on what has been measured. Rows that differ are marked. Pokter does not declare a winner where the evidence cannot support one.</p>
      </header>

      {items.length < 2 ? (
        <EmptyState title="Pick at least two agents" action={<LinkButton href="/discover">Choose on Discover</LinkButton>}>
          Use Compare on any agent card or profile. Up to four at once.
        </EmptyState>
      ) : (
        <CompareView items={items} images={images} />
      )}
    </div>
  );
}
