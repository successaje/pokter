import { apiError, apiJson, apiOptions, apiRateLimit } from '@/lib/api/respond';
import { loadJobEvidence } from '@/lib/jobs/evidence';
import { jobChainParam } from '@/lib/jobs/href';
import { outcomeRecord } from '@/lib/jobs/outcome-record';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: Request, { params }: { params: Promise<{ chainId: string; jobId: string }> }) {
  const limited = apiRateLimit(request, 'outcome-record');
  if (limited) return limited;
  const { chainId: chainParam, jobId } = await params;
  const chainId = jobChainParam(chainParam);
  if (!chainId || !/^\d{1,18}$/.test(jobId)) return apiError('Job not found.', 404);
  const evidence = await loadJobEvidence(chainId, jobId);
  if (!evidence) return apiError('Job not found.', 404);
  return apiJson(outcomeRecord(evidence), 200, { perRequest: true });
}
