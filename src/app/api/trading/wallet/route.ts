import { NextResponse } from 'next/server';
import { getAddress, isAddress } from 'viem';

import { readHoldings, WATCHED_TOKENS } from '@/lib/trading/read';
import { getTradingStore } from '@/lib/trading/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/** A watched trading wallet: what it holds now, read live, and what the scans found, from the store. */
export async function GET(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`trading-wallet:${requestClientKey(request)}`, { limit: 12, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many reads. Try again shortly.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  const raw = new URL(request.url).searchParams.get('wallet') ?? '';
  if (!isAddress(raw)) return NextResponse.json({ error: 'Enter the trading wallet’s address.' }, { status: 400 });
  const store = getTradingStore();
  const watched = store.get(raw);
  try {
    const holdings = await readHoldings({ wallet: getAddress(raw) });
    return NextResponse.json(
      { holdings, watched, flows: watched ? store.flows(raw) : [], gaps: watched ? store.gaps(raw) : [], checkedTokens: WATCHED_TOKENS.map((t) => t.symbol) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('[trading/wallet]', error);
    return NextResponse.json({ error: 'The chain could not be read just now. Try again shortly.' }, { status: 502 });
  }
}
