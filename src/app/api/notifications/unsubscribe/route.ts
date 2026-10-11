import { NextResponse } from 'next/server';

import { emailLinkDestination } from '@/lib/notifications/link-destination';
import { unsubscribe, type EmailLinkTarget } from '@/lib/notifications/server';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  let target: EmailLinkTarget | null = null;
  try { target = unsubscribe(token); } catch { target = null; }
  // The public origin, not request.url (see the verify route).
  return NextResponse.redirect(new URL(`${emailLinkDestination(target)}?email=${target ? 'unsubscribed' : 'invalid'}`, siteUrl()), 303);
}
