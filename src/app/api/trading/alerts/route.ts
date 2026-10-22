import { NextResponse } from 'next/server';
import { getAddress, isAddress } from 'viem';

import { createTradingAlert } from '@/lib/notifications/server';
import { getTradingStore } from '@/lib/trading/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/** Ask for alerts on a watched trading wallet. A confirmation is sent; nothing else until it is confirmed. */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`trading-alerts:${requestClientKey(request)}`, { limit: 4, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(body.email ?? '').trim().toLowerCase();
  const wallet = String(body.wallet ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (!isAddress(wallet)) return NextResponse.json({ error: 'Enter the trading wallet’s address.' }, { status: 400 });
  // Alerts come from the sweep's scans, so only a watched wallet can have them.
  if (!getTradingStore().get(wallet)) return NextResponse.json({ error: 'Start watching this wallet first.' }, { status: 409 });
  try {
    await createTradingAlert({ email, wallet: getAddress(wallet) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[trading/alerts]', error);
    return NextResponse.json({ error: 'Could not send the confirmation email just now. Try again shortly.' }, { status: 502 });
  }
}
