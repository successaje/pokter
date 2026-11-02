import { NextResponse } from 'next/server';
import { getAddress, isAddress } from 'viem';

import { campaignEvidence } from '@/lib/campaign/evidence';
import { campaignProgress } from '@/lib/campaign/progress-server';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`campaign-evidence:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  const raw = new URL(request.url).searchParams.get('address') ?? '';
  if (!isAddress(raw)) return NextResponse.json({ error: 'A wallet address is required.' }, { status: 400 });
  const address = getAddress(raw);
  try {
    return NextResponse.json(campaignEvidence(await campaignProgress(address, { includeEvidence: true })), {
      headers: {
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="pokter-campaign-evidence-${address.toLowerCase()}.json"`,
      },
    });
  } catch (error) {
    console.error('[campaign/evidence]', error);
    return NextResponse.json({ error: 'Evidence could not be read just now. Try again shortly.' }, { status: 502 });
  }
}
