import { NextResponse } from 'next/server';
import { verifySubscription } from '@/lib/notifications/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const kind = token.length >= 32 ? verifySubscription(token) : null;
  const destination = kind === 'builder' ? '/builder' : '/activity';
  return NextResponse.redirect(new URL(`${destination}?email=${kind ? 'verified' : 'invalid'}`, request.url), 303);
}
