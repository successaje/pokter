import { NextResponse } from 'next/server';
import { getAddress, isAddress } from 'viem';

import { campaignProgress } from '@/lib/campaign/progress-server';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/** A wallet's Set and Earn progress, from public chain and registry data. Any address: /quest reads the same. */
export async function GET(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`campaign-progress:${requestClientKey(request)}`, { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  const raw = new URL(request.url).searchParams.get('address') ?? '';
  if (!isAddress(raw)) return NextResponse.json({ error: 'A wallet address is required.' }, { status: 400 });
  try {
    return NextResponse.json(await campaignProgress(getAddress(raw)), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('[campaign/progress]', error);
    return NextResponse.json({ error: 'Progress could not be read just now. Try again shortly.' }, { status: 502 });
  }
}
