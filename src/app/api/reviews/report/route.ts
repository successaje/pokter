import { NextResponse } from 'next/server';

import { REVIEW_REPORT_REASONS, type ReviewReportReason } from '@/lib/reviews/model';
import { getReviewStore } from '@/lib/reviews/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`review-report:${requestClientKey(request)}`, { limit: 5, windowMs: 60 * 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Report limit reached. Try again later.' }, { status: 429 });
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 }); }
  const chainId = Number(body.chainId);
  const jobId = String(body.jobId ?? '');
  const reason = String(body.reason ?? '') as ReviewReportReason;
  const detail = String(body.detail ?? '').trim();
  if (![56, 97].includes(chainId) || !/^\d+$/.test(jobId) ||
      !REVIEW_REPORT_REASONS.includes(reason) || detail.length > 500) {
    return NextResponse.json({ error: 'The report payload is invalid.' }, { status: 400 });
  }
  try {
    const reportId = getReviewStore().report({ chainId, jobId, reason, detail });
    return NextResponse.json({ reported: true, reportId }, { status: 201 });
  } catch (error) {
    // Only the store's own not-found is the caller's; anything else (the database) is the server's.
    const message = (error as Error).message;
    if (message === 'Review not found.' || message === 'Report not found.') return NextResponse.json({ error: message }, { status: 404 });
    console.error('[reviews/report]', error);
    return NextResponse.json({ error: 'The review store could not be updated just now.' }, { status: 500 });
  }
}
