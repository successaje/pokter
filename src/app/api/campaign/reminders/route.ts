import { NextResponse } from 'next/server';
import { getAddress, isAddress } from 'viem';

import { isCampaignLive } from '@/lib/campaign/window';
import { createCampaignReminder } from '@/lib/notifications/server';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/** Ask for Set and Earn reminders. A confirmation email is sent; nothing else until it is confirmed. */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`campaign-reminders:${requestClientKey(request)}`, { limit: 4, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  if (!isCampaignLive()) return NextResponse.json({ error: 'Set and Earn has closed.' }, { status: 410 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(body.email ?? '').trim().toLowerCase();
  const walletRaw = typeof body.wallet === 'string' ? body.wallet : '';
  const deadline = body.deadline !== false;
  const progress = body.progress === true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (walletRaw && !isAddress(walletRaw)) return NextResponse.json({ error: 'That wallet address is not valid.' }, { status: 400 });
  if (progress && !walletRaw) return NextResponse.json({ error: 'Progress emails need a wallet to watch.' }, { status: 400 });
  if (!deadline && !progress) return NextResponse.json({ error: 'Choose at least one kind of reminder.' }, { status: 400 });
  try {
    await createCampaignReminder({ email, wallet: walletRaw ? getAddress(walletRaw) : null, deadline, progress });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[campaign/reminders]', error);
    return NextResponse.json({ error: 'Could not send the confirmation email just now. Try again shortly.' }, { status: 502 });
  }
}
