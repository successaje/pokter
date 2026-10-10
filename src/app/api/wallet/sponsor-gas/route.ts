import { NextResponse } from 'next/server';

import { sponsorGas, sponsorHealth } from '@/lib/wallet/sponsor';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Whether a hire here can be one signature. Read by the readiness row and
 * the rail; the balance is public on chain and says how many more it covers.
 */
export async function GET(): Promise<NextResponse> {
  const health = await sponsorHealth();
  return NextResponse.json(
    { available: health.available, configured: health.configured, chainId: health.chainId, address: health.address, balanceBnb: Number(health.balance) / 1e18, topUpsLeft: health.topUpsLeft, low: health.low, checkedAt: health.checkedAt },
    { headers: { 'cache-control': 'private, max-age=60' } },
  );
}

/** Top up the named wallet's gas, under the policy in `sponsorGas`. */
export async function POST(request: Request): Promise<NextResponse> {
  const clientKey = requestClientKey(request);
  const rate = consumeRateLimit(`sponsor-requests:${clientKey}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ status: 'refused', reason: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  }
  let body: { address?: unknown };
  try {
    body = (await request.json()) as { address?: unknown };
  } catch {
    return NextResponse.json({ status: 'refused', reason: 'Expected JSON with an address.' }, { status: 400 });
  }
  if (typeof body.address !== 'string') {
    return NextResponse.json({ status: 'refused', reason: 'Expected an address.' }, { status: 400 });
  }
  const outcome = await sponsorGas(body.address, clientKey);
  const serialisable = JSON.parse(JSON.stringify(outcome, (_, value) => (typeof value === 'bigint' ? value.toString() : value))) as Record<string, unknown>;
  return NextResponse.json(serialisable, { status: outcome.status === 'refused' ? 409 : 200 });
}
