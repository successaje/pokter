import { NextResponse } from 'next/server';
import { unsubscribe } from '@/lib/notifications/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  let kind: 'buyer' | 'builder' | null = null;
  try { kind = unsubscribe(token); } catch { kind = null; }
  const destination = kind === 'builder' ? '/builder' : '/activity';
  return NextResponse.redirect(new URL(`${destination}?email=${kind ? 'unsubscribed' : 'invalid'}`, request.url), 303);
}
