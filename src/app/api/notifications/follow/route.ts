import { NextResponse } from 'next/server';

import { createAgentFollow } from '@/lib/notifications/server';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/** Follow an agent by email. A confirmation email is sent; nothing else until it is confirmed. */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`agent-follow:${requestClientKey(request)}`, { limit: 4, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(body.email ?? '').trim().toLowerCase();
  const chainId = Number(body.chainId);
  const tokenId = String(body.tokenId ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if ((chainId !== 56 && chainId !== 97) || !/^\d{1,12}$/.test(tokenId)) return NextResponse.json({ error: 'Unknown agent.' }, { status: 400 });
  try {
    const agent = await getAgent(chainId as ChainId, tokenId).catch(() => null);
    await createAgentFollow({ email, chainId, tokenId, agentName: agent?.name?.slice(0, 120) || `Agent #${tokenId}` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'Could not start email confirmation.' }, { status: 400 });
  }
}
