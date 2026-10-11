import { NextResponse } from 'next/server';

import { evidenceCard } from '@/lib/evidence/agent';
import { siteOrigin } from '@/lib/evidence/origin';

export const dynamic = 'force-dynamic';

/**
 * The same card at the path probers actually look for.
 *
 * A2A consumers fetch `<base>/.well-known/agent-card.json`, and several of
 * the marketplaces this agent is meant to be listed on probe only there.
 * It is scoped under /evidence rather than the site root on purpose:
 * pokter.xyz is a marketplace, not an agent, and claiming the root would
 * advertise the whole site as one callable service.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(evidenceCard(siteOrigin()), {
    headers: { 'cache-control': 'public, max-age=300' },
  });
}
