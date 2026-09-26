import { NextResponse } from 'next/server';

import { readDeliverable } from '@/lib/erc8183/deliverables';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const { jobId } = await params;
  const validJobId =
    /^\d+$/.test(jobId) && BigInt(jobId) <= BigInt(Number.MAX_SAFE_INTEGER);
  if (!validJobId) {
    return NextResponse.json({ error: 'Invalid job id.' }, { status: 400 });
  }
  const deliverable = readDeliverable(jobId);
  if (!deliverable) {
    return NextResponse.json(
      { error: 'Deliverable not found.' },
      { status: 404 },
    );
  }
  return new NextResponse(deliverable.manifestText, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
