import { NextResponse } from 'next/server';

import { siteUrl } from '@/lib/site';
import { unsubscribe } from '@/lib/notifications/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  let kind: 'buyer' | 'builder' | 'follow' | null = null;
  try { kind = unsubscribe(token); } catch { kind = null; }
  const destination = kind === 'builder' ? '/studio' : kind === 'follow' ? '/workspace/saved' : '/workspace/inbox';
  // The public origin, not request.url (see the verify route).
  return NextResponse.redirect(new URL(`${destination}?email=${kind ? 'unsubscribed' : 'invalid'}`, siteUrl()), 303);
}
