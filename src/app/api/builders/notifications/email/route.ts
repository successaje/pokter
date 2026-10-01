import { NextRequest, NextResponse } from 'next/server';

import { BUILDER_SESSION_COOKIE, builderSessionOwner } from '@/lib/builders/store';
import { builderEmailStatus, createBuilderSubscription } from '@/lib/notifications/server';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

function owner(request: NextRequest): string | null {
  return builderSessionOwner(request.cookies.get(BUILDER_SESSION_COOKIE)?.value);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const builder = owner(request);
  if (!builder) return NextResponse.json({ error: 'Builder verification is required.' }, { status: 401 });
  return NextResponse.json(builderEmailStatus(builder), { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rate = consumeRateLimit(`builder-email:${requestClientKey(request)}`, { limit: 4, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json(
    { error: 'Too many requests. Try again shortly.' },
    { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } },
  );
  const builder = owner(request);
  if (!builder) return NextResponse.json({ error: 'Builder verification is required.' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { email?: unknown };
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  try {
    await createBuilderSubscription({ email, owner: builder });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'Could not start email verification.' }, { status: 502 });
  }
}
