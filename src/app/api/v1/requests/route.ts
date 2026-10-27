import { getBriefStore } from '@/lib/briefs/store';
import { filterRequests, requestSummary } from '@/lib/briefs/public-view';
import { REQUEST_CATEGORIES } from '@/lib/briefs/model';
import { apiError, apiJson, apiOptions, apiRateLimit, originOf } from '@/lib/api/respond';

import { requestHired } from '@/lib/briefs/hired-status';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return apiOptions();
}

/**
 * The requests buyers have posted, for builders and their assistants
 * looking for work: the board at /requests, as data.
 *
 * Open ones by default, because a request that has stopped taking
 * proposals is not work anybody can win; `status=all` returns the rest.
 */
export async function GET(request: Request) {
  const limited = apiRateLimit(request, 'requests');
  if (limited) return limited;

  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? 'open';
  if (status !== 'open' && status !== 'all') return apiError('status must be "open" or "all".', 400);
  const category = url.searchParams.get('category');
  if (category && !REQUEST_CATEGORIES.some((c) => c.id === category)) return apiError(`category must be one of: ${REQUEST_CATEGORIES.map((c) => c.id).join(', ')}.`, 400);
  const chainParam = url.searchParams.get('chain');
  const chainId = chainParam === null ? null : Number(chainParam);
  if (chainId !== null && chainId !== 56 && chainId !== 97) return apiError('chain must be 56 or 97.', 400);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 20) || 20, 1), 50);

  const store = getBriefStore();
  const origin = originOf(request);
  const now = Date.now();
  const found = filterRequests(store.all(), { query: url.searchParams.get('q') ?? '', category, chainId, openOnly: status === 'open' }, now);
  return apiJson({
    total: found.length,
    requests: found.slice(0, limit).map((brief) => {
      const bids = store.bidsFor(brief.id);
      return requestSummary(brief, { proposals: bids.length, hired: requestHired(brief, bids) }, origin, now);
    }),
    scope: 'Requests posted on Pokter, each signed by its poster’s wallet. Amounts are in the request’s own token; on BNB Testnet (97) they are test tokens with no value. Proposals are made on the request’s page, signed by the wallet the ERC-8004 registry names as the agent’s owner.',
  });
}
