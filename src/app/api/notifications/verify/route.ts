import { NextResponse } from 'next/server';

import { emailLinkDestination } from '@/lib/notifications/link-destination';
import { verifyIdentity, verifySubscription } from '@/lib/notifications/server';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  if (token.length < 32) {
    return NextResponse.redirect(new URL('/workspace/inbox?email=invalid', siteUrl()), 303);
  }

  /*
   * One link handler for both shapes.
   *
   * A per-job subscription and a wallet's reusable notification address are
   * confirmed by the same kind of emailed link, and a buyer cannot tell
   * which they were sent. Trying the job subscription first keeps every
   * link already in somebody's inbox working exactly as before; an identity
   * token simply falls through to the second check.
   */
  const target = verifySubscription(token);
  if (!target) {
    const identity = verifyIdentity(token);
    if (identity) {
      return NextResponse.redirect(new URL('/workspace/inbox?email=verified', siteUrl()), 303);
    }
  }
  // The public origin, not request.url: behind the proxy that is the
  // machine's own address (0.0.0.0:8080), which nobody outside can open.
  return NextResponse.redirect(new URL(`${emailLinkDestination(target)}?email=${target ? 'verified' : 'invalid'}`, siteUrl()), 303);
}
