import { NextResponse } from 'next/server';

import { evidenceCard } from '@/lib/evidence/agent';
import { siteOrigin } from '@/lib/evidence/origin';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(evidenceCard(siteOrigin()), {
    headers: { 'cache-control': 'public, max-age=300' },
  });
}
