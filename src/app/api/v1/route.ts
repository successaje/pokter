import { CATEGORIES } from '@/lib/agents/categories';
import { apiEndpoints } from '@/lib/api/endpoints';
import { VERDICTS, VOCABULARY } from '@/lib/search/query';
import { API_VERSION } from '@/lib/api/v1';
import { API_CHANGES } from '@/lib/api/changes';
import { apiJson, apiOptions, apiRateLimit, originOf } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return apiOptions();
}

/**
 * The service description, for a caller that has no documentation.
 *
 * Enumerations come from the modules that define them rather than being
 * restated here, so the categories, verdicts and query vocabulary a caller
 * reads are the ones the marketplace actually enforces. A hand-maintained copy
 * would be wrong the first time either changed, and wrong in the worst place:
 * the document a machine trusts because it was served by the thing it
 * describes.
 */
export async function GET(request: Request) {
  const limited = apiRateLimit(request, 'index');
  if (limited) return limited;

  const origin = originOf(request);

  return apiJson({
    version: API_VERSION,
    description:
      'Read-only access to Pokter’s marketplace: which agents exist, what has been measured about them, where every figure came from, and the requests buyers have posted.',
    /* What changed in these responses, newest first, with what to do about it (also at /developers#api-changes). */
    changes: API_CHANGES,
    endpoints: apiEndpoints(API_VERSION),
    enums: {
      categories: CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
      verdicts: VERDICTS,
      provenance: [
        'onchain',
        'attested',
        'pokter-measured',
        'calculated',
        'declared',
      ],
      query: VOCABULARY,
    },
    notes: {
      provenance:
        'Every figure in a list response is wrapped with the provenance and source that produced it. A number without those is a number you cannot check.',
      proven:
        'The list endpoint never returns the "proven" verdict: deciding it requires attestations decoded to their measurers, which only the detail endpoint does.',
      independence:
        'Independence is bound to the feedback transaction sender, not a self-declared name. Pokter wallets, agent owners and unreadable authors never count.',
      notMeasured:
        'Returns, drawdown, capital managed and gas costs are never reported. Nobody publishes them and inferring them from uptime would be fabrication.',
      rateLimits: '60 requests per minute per client; 30 for agent detail.',
    },
    links: {
      humanReadable: `${origin}/methodology`,
      diagnostic: `${origin}/compatibility`,
      evaluators: `${origin}/evaluators`,
    },
  });
}
