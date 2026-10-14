import { NextResponse } from 'next/server';

import { getJobStore } from '@/lib/erc8183/store';
import { jobChainParam } from '@/lib/jobs/href';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * What the seller said when told this job was funded, or null when it has
 * not been asked yet. Public, like the job: the answer is about the job,
 * not the buyer.
 */
export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }): Promise<NextResponse> {
  const limited = consumeRateLimit(`job-notice:${requestClientKey(request)}`, { limit: 60, windowMs: 60_000 });
  if (!limited.allowed) return NextResponse.json({ error: 'Too many lookups.' }, { status: 429 });
  const { jobId } = await context.params;
  const chainId = jobChainParam(new URL(request.url).searchParams.get('chain'));
  if (!/^\d{1,18}$/.test(jobId) || chainId === null) {
    return NextResponse.json({ error: 'A numeric job id and ?chain=56 or 97 are required.' }, { status: 400 });
  }
  const notice = getJobStore().noticeFor(chainId, jobId);
  return NextResponse.json({
    notice: notice && { status: notice.status, reason: notice.reason, attempts: notice.attempts, at: notice.lastAt },
  });
}
