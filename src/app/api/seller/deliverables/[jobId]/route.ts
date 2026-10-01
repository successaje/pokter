import { NextResponse } from 'next/server';
import { isHex } from 'viem';
import { verifyErc8183ManifestText } from '@altananetwork/sdk';

import { readDeliverable } from '@/lib/erc8183/deliverables';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
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
  const expected = new URL(request.url).searchParams.get('hash');
  if (expected && (!isHex(expected, { strict: true }) || expected.length !== 66 || !verifyErc8183ManifestText(deliverable.manifestText, expected as `0x${string}`))) {
    return NextResponse.json(
      { error: 'This manifest version does not match the requested hash.' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } },
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
