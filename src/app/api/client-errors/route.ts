import { NextResponse } from 'next/server';

import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/*
 * A page that broke in the browser, reported by the error page so it reaches
 * the server log. A render failure in the browser left nothing on the
 * server: the hire crashes of 31 October showed no error at all in the log,
 * and the only trace was a console nobody could see but the buyer.
 *
 * Written to the log and nowhere else. Only what the error page sends is
 * kept, each part cut short, and a path never carries its query string,
 * where a brief can sit.
 */
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max).replace(/[\r\n]+/g, ' ⏎ ') : null);

export async function POST(request: Request): Promise<NextResponse> {
  const limited = consumeRateLimit(`client-errors:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!limited.allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const message = text(body?.message, 500);
  if (!message) return NextResponse.json({ error: 'message is required.' }, { status: 400 });
  const path = text(body?.path, 200)?.split('?')[0] ?? null;
  console.error(`[client-error] ${path ?? '?'} ${text(body?.digest, 40) ?? '-'} ${message} | ${text(body?.stack, 1_500) ?? 'no stack'}`);
  return NextResponse.json({ ok: true });
}
