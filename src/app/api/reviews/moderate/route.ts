import { NextResponse } from 'next/server';

import { getReviewStore } from '@/lib/reviews/store';

function authorized(request: Request): boolean {
  const secret = process.env.SWEEP_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  return NextResponse.json({ reports: getReviewStore().reports() });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 }); }
  const reportId = Number(body.reportId);
  const action = String(body.action ?? '') as 'dismiss' | 'hide' | 'restore';
  const reason = String(body.reason ?? '').trim();
  if (!Number.isSafeInteger(reportId) || reportId < 1 || !['dismiss', 'hide', 'restore'].includes(action) || reason.length < 3 || reason.length > 500) {
    return NextResponse.json({ error: 'reportId, action and a moderation reason are required.' }, { status: 400 });
  }
  try {
    getReviewStore().moderate({ reportId, action, reason });
    return NextResponse.json({ moderated: true, reportId, action });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 404 });
  }
}
