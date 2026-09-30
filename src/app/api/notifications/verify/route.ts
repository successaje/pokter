import { NextResponse } from 'next/server';
import { verifySubscription } from '@/lib/notifications/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const ok = token.length >= 32 && verifySubscription(token);
  return NextResponse.redirect(new URL(`/my-agents?email=${ok ? 'verified' : 'invalid'}`, request.url), 303);
}
