import { NextResponse } from 'next/server';

import { siteUrl } from '@/lib/site';
import { verifySubscription } from '@/lib/notifications/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const kind = token.length >= 32 ? verifySubscription(token) : null;
  const destination = kind === 'builder' ? '/studio' : kind === 'follow' ? '/workspace/saved' : '/workspace/inbox';
  // The public origin, not request.url: behind the proxy that is the
  // machine's own address (0.0.0.0:8080), which nobody outside can open.
  return NextResponse.redirect(new URL(`${destination}?email=${kind ? 'verified' : 'invalid'}`, siteUrl()), 303);
}
