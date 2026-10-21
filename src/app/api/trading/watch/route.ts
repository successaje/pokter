import { NextResponse } from 'next/server';
import { getAddress, isAddress } from 'viem';

import { DELEGATED_TRADERS } from '@/lib/trading/agents';
import { scanWatchedWallet } from '@/lib/trading/read';
import { getTradingStore } from '@/lib/trading/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/** While this is a pilot: enough for the named traders, not a public scanning service. */
const MAX_WATCHED = 50;

/** Start watching a trading wallet. Public data: no signature, and no email until alerts are added. */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`trading-watch:${requestClientKey(request)}`, { limit: 3, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const wallet = String(body.wallet ?? '');
  if (!isAddress(wallet)) return NextResponse.json({ error: 'Enter the trading wallet’s address.' }, { status: 400 });
  const agent = typeof body.agent === 'string' && body.agent in DELEGATED_TRADERS ? body.agent : null;
  const owners = (Array.isArray(body.owners) ? body.owners : []).map(String).filter((o) => isAddress(o)).slice(0, 5).map((o) => getAddress(o));
  const store = getTradingStore();
  if (!store.get(wallet) && store.count() >= MAX_WATCHED) return NextResponse.json({ error: 'The pilot is watching as many wallets as it can for now.' }, { status: 409 });
  store.watch({ wallet: getAddress(wallet), agentKey: agent, owners });
  // The first look now, so the page has something to show before the next sweep.
  const first = await scanWatchedWallet(getAddress(wallet));
  return NextResponse.json({ ok: true, first });
}
