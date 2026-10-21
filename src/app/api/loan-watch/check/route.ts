import { NextResponse } from 'next/server';
import { getAddress, isAddress } from 'viem';

import { readLoan } from '@/lib/loan-watch/read';
import { dropToLiquidation } from '@/lib/loan-watch/rules';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/** A Venus Core Pool position's health right now. Public: the position is on chain for anyone to read. */
export async function GET(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`loan-check:${requestClientKey(request)}`, { limit: 12, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many checks. Try again shortly.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  const raw = new URL(request.url).searchParams.get('wallet') ?? '';
  if (!isAddress(raw)) return NextResponse.json({ error: 'Enter a wallet address.' }, { status: 400 });
  try {
    const r = await readLoan(getAddress(raw));
    return NextResponse.json(
      { wallet: getAddress(raw), healthFactor: r.healthFactor, liquidatable: r.liquidatable, borrowUsd: r.borrowUsd, drop: dropToLiquidation(r.healthFactor), collateral: r.collateral, debt: r.debt, block: String(r.block), readAt: new Date().toISOString() },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('[loan-watch/check]', error);
    return NextResponse.json({ error: 'Venus could not be read just now. Try again shortly.' }, { status: 502 });
  }
}
