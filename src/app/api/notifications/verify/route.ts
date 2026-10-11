import { NextResponse } from 'next/server';

import { emailLinkDestination } from '@/lib/notifications/link-destination';
import { verifySubscription } from '@/lib/notifications/server';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const target = token.length >= 32 ? verifySubscription(token) : null;
  // The public origin, not request.url: behind the proxy that is the
  // machine's own address (0.0.0.0:8080), which nobody outside can open.
  return NextResponse.redirect(new URL(`${emailLinkDestination(target)}?email=${target ? 'verified' : 'invalid'}`, siteUrl()), 303);
}
