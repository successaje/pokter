import { isPromotableAgent } from '@/lib/agents/eligibility';
import { listSearchable, searchByName } from '@/lib/marketplace';
import { matchesQuery, offersDirectHire, verdictFor } from '@/lib/search/match';
import { parseQuery } from '@/lib/search/query';
import { CATEGORIES } from '@/lib/agents/categories';
import { page, toAgentSummary } from '@/lib/api/v1';
import { apiError, apiJson, apiOptions, apiRateLimit, originOf } from '@/lib/api/respond';
import { unknownParams } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

const MAX_LIMIT = 100;

/**
 * Everything this endpoint reads. Anything else is refused.
 *
 * The filters are the query language's, by design — see the note on `GET`.
 * That makes a parameter like `chainId` not a filter this route ignores but
 * one it does not have, and answering `200` to it returned every chain to a
 * caller who had asked for one.
 */
const PARAMS = ['q', 'category', 'limit', 'offset'] as const;

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
 *
 * So chain is `q=is:mainnet` or `q=is:testnet`, not a `chainId` parameter.
 * A parameter this route does not have is now refused rather than ignored:
 * `?chainId=56` used to answer 200 with both chains, which reads as a
 * filtered list and is not one. `limit` above {@link MAX_LIMIT} is clamped
 * rather than refused, and the response states the limit actually applied.
 */
export async function GET(request: Request) {
  const limited = apiRateLimit(request, 'agents');
  if (limited) return limited;

  const url = new URL(request.url);
  const unknown = unknownParams(url.searchParams.keys(), PARAMS);
  if (unknown) return apiError(unknown.message, 400);

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

  /*
   * The same pool Discover searches: its depth, and without the drafts and
   * demos whose own names say they are not the real thing. Reading a shallower
   * list here made `is:hireable` count different agents from the home page.
   */
  const all = await listSearchable({ limit: 400 });

  /*
   * No agent in the pool whose name matches: ask the registry by name, as
   * Discover does. The pool is built from category listings, so an agent
   * in no category could not be found by its own name here while the
   * site found it. Every other filter still applies to what comes back.
   */
  const terms = parsed.qualifiers.flatMap((qualifier) => (qualifier.kind === 'text' ? [qualifier.value] : []));
  const named = (entry: (typeof all)[number]) => {
    const name = entry.listing.agent.name.toLowerCase();
    return terms.length > 0 && terms.every((term) => name.includes(term));
  };
  if (terms.length > 0 && !all.some(named)) {
    const have = new Set(all.map((entry) => `${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`));
    const byName = await searchByName(terms.join(' ')).catch(() => []);
    all.push(...byName.filter((entry) => !have.has(`${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`)));
  }

  const matched = all
    .filter((entry) => isPromotableAgent(entry.listing.agent))
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
