import { NextResponse } from 'next/server';

import { siteOrigin } from '@/lib/evidence/origin';
import { houseCard } from '@/lib/house/card';
import { houseAgent } from '@/lib/house/registry';

export const dynamic = 'force-dynamic';

/** The card both registrations can point at; the per-chain card names where it settles. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  const definition = houseAgent((await params).slug);
  if (!definition) return NextResponse.json({ error: 'No such agent.' }, { status: 404 });
  return NextResponse.json(houseCard(definition, siteOrigin()), { headers: { 'cache-control': 'public, max-age=300' } });
}
