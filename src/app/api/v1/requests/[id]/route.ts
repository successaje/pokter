import { getBriefStore } from '@/lib/briefs/store';
import { requestDetail } from '@/lib/briefs/public-view';
import { apiError, apiJson, apiOptions, apiRateLimit, originOf } from '@/lib/api/respond';

import { requestHired } from '@/lib/briefs/hired-status';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return apiOptions();
}

/** One request in full: its terms, its status and every proposal on it, as its page shows them. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = apiRateLimit(request, 'requests');
  if (limited) return limited;
  const { id } = await params;
  if (!/^[0-9a-f-]{8,64}$/i.test(id)) return apiError('No such request.', 404);
  const store = getBriefStore();
  const brief = store.get(id);
  if (!brief) return apiError('No such request.', 404);
  const bids = store.bidsFor(id);
  return apiJson({ request: requestDetail(brief, bids, { hired: requestHired(brief, bids) }, originOf(request)) });
}
