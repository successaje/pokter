import { NextResponse } from 'next/server';
import { getAddress, isAddress } from 'viem';

import { THRESHOLD_MAX, THRESHOLD_MIN } from '@/lib/loan-watch/rules';
import { createLoanWatch } from '@/lib/notifications/server';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/** Watch a Venus position by email. A confirmation is sent; nothing else until it is confirmed. */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`loan-watch:${requestClientKey(request)}`, { limit: 4, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(body.email ?? '').trim().toLowerCase();
  const wallet = String(body.wallet ?? '');
  const threshold = Number(body.threshold);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (!isAddress(wallet)) return NextResponse.json({ error: 'Enter the wallet that holds the Venus position.' }, { status: 400 });
  if (!Number.isFinite(threshold) || threshold < THRESHOLD_MIN || threshold > THRESHOLD_MAX) {
    return NextResponse.json({ error: `Choose a threshold between ${THRESHOLD_MIN.toFixed(1)} and ${THRESHOLD_MAX.toFixed(1)}.` }, { status: 400 });
  }
  try {
    await createLoanWatch({ email, wallet: getAddress(wallet), threshold: Math.round(threshold * 100) / 100 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[loan-watch]', error);
    return NextResponse.json({ error: 'Could not send the confirmation email just now. Try again shortly.' }, { status: 502 });
  }
}
