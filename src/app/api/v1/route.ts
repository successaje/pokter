import { CATEGORIES } from '@/lib/agents/categories';
import { VERDICTS, VOCABULARY } from '@/lib/search/query';
import { API_VERSION } from '@/lib/api/v1';
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
      'Read-only access to Pokter’s marketplace: which agents exist, what has been measured about them, and where every figure came from.',
    endpoints: [
      {
        method: 'GET',
        path: `/api/${API_VERSION}/agents`,
        description: 'Search and list agents.',
        parameters: {
          q: 'Marketplace query, e.g. "is:live has:probes>10". Same language as the site search.',
          category: `One of: ${CATEGORIES.map((c) => c.id).join(', ')}.`,
          limit: '1–100, default 25.',
          offset: 'Default 0. Ordering is by token id and is stable across requests.',
        },
      },
      {
        method: 'GET',
        path: `/api/${API_VERSION}/agents/{chainId}/{tokenId}`,
        description:
          'One agent with its full evidence, including decoded attestations and the measurers behind them.',
      },
    ],
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
        'Pokter’s own probing never counts toward measurer independence, so an agent measured only by Pokter cannot be proven however well it performs.',
      notMeasured:
        'Returns, drawdown, capital managed and gas costs are never reported. Nobody publishes them and inferring them from uptime would be fabrication.',
      rateLimits: '60 requests per minute per client; 30 for agent detail.',
    },
    links: {
      humanReadable: `${origin}/methodology`,
      diagnostic: `${origin}/compatibility`,
    },
  });
}
