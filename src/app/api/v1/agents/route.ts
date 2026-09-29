import { listSearchable } from '@/lib/marketplace';
import { matchesQuery, offersDirectHire, verdictFor } from '@/lib/search/match';
import { parseQuery } from '@/lib/search/query';
import { CATEGORIES } from '@/lib/agents/categories';
import { page, toAgentSummary } from '@/lib/api/v1';
import { apiError, apiJson, apiOptions, apiRateLimit, originOf } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

const MAX_LIMIT = 100;

export function OPTIONS() {
  return apiOptions();
}

/**
 * Discovery. The same query language the marketplace search uses.
 *
 * Reusing `parseQuery` and `matchesQuery` rather than inventing filter
 * parameters means a caller can lift a query straight out of a marketplace URL
 * and get the same set back — and, more usefully, that the API cannot drift
 * into filtering differently from the pages people check it against.
 */
export async function GET(request: Request) {
  const limited = apiRateLimit(request, 'agents');
  if (limited) return limited;

  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const category = url.searchParams.get('category');
  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit') ?? 25) || 25, 1),
    MAX_LIMIT,
  );
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0);

  if (category && !CATEGORIES.some((c) => c.id === category)) {
    return apiError(
      `Unknown category. Known categories: ${CATEGORIES.map((c) => c.id).join(', ')}.`,
      400,
    );
  }

  const parsed = parseQuery(q);
  if (parsed.unknown.length > 0) {
    return apiError(
      `Unrecognised query terms: ${parsed.unknown.join(', ')}.`,
      400,
    );
  }

  const all = await listSearchable({ limit: 30 });
  const matched = all
    .filter((entry) => (category ? entry.listing.category === category : true))
    .filter((entry) =>
      parsed.qualifiers.length ? matchesQuery(entry, parsed) : true,
    )
    /*
     * Sorted before slicing, and by a key that cannot change between requests.
     * Ranking order moves with every sweep, so paging through it would repeat
     * and skip agents; token id is arbitrary but stable, which is what a page
     * boundary needs to be.
     */
    .sort((a, b) =>
      a.listing.agent.token_id.localeCompare(b.listing.agent.token_id, 'en', {
        numeric: true,
      }),
    );

  const origin = originOf(request);
  const items = matched.slice(offset, offset + limit).map((entry) => ({
    ...toAgentSummary(
      entry.listing,
      entry.record,
      verdictFor(entry),
      origin,
    ),
    hirable: offersDirectHire(entry),
  }));

  return apiJson(page(items, { total: matched.length, limit, offset }));
}
