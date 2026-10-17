import { CompareSheet } from '@/features/compare/CompareSheet';
import { CompareView } from '@/features/compare/CompareView';
import { loadComparison } from '@/features/compare/load';

/*
 * Compare opened from a page on this site: the comparison in a sheet over
 * that page, so the reader keeps their place. A shared link, a refresh or
 * "Full page" loads /compare itself.
 */
export default async function CompareInSheet({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const raw = (await searchParams).agents;
  const { keys, items, images } = await loadComparison(raw);
  return (
    <CompareSheet fullPageHref={`/compare?agents=${keys.join(',')}`}>
      {items.length < 2 ? <p className="text-sm text-ink-2">Pick at least two agents to compare.</p> : <CompareView items={items} images={images} />}
    </CompareSheet>
  );
}
