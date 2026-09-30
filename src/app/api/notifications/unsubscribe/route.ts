import { NextResponse } from 'next/server';
import { unsubscribe } from '@/lib/notifications/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  let ok = false;
  try { ok = unsubscribe(token); } catch { ok = false; }
  return NextResponse.redirect(new URL(`/my-agents?email=${ok ? 'unsubscribed' : 'invalid'}`, request.url), 303);
}
