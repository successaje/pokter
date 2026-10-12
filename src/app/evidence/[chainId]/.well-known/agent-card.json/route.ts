import { NextResponse } from 'next/server';

import { evidenceCard } from '@/lib/evidence/agent';
import { siteOrigin } from '@/lib/evidence/origin';
import { EVIDENCE_CHAINS } from '@/lib/evidence/refs';
import type { ChainId } from '@/lib/scan/types';

export const dynamic = 'force-dynamic';

/**
 * The card for one escrow chain's listing.
 *
 * Register a chain-56 identity against `/evidence/56/.well-known/…` and
 * every quote that listing produces is denominated in mainnet currency;
 * the chain-97 identity points at `/evidence/97/…` and quotes in testnet
 * currency. Without this, one endpoint had to pick a default for every
 * listing at once, and picked wrong for one of them — a price signed
 * honestly in a token that listing's escrow cannot settle.
 *
 * The unqualified `/evidence/.well-known/agent-card.json` still answers,
 * because it is what the chain-97 identity already points at.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chainId: string }> },
): Promise<NextResponse> {
  const { chainId } = await params;
  const asked = Number(chainId);
  if (!(EVIDENCE_CHAINS as number[]).includes(asked)) {
    return NextResponse.json(
      { error: `This agent is listed on chain ${EVIDENCE_CHAINS.join(' and ')}.` },
      { status: 404 },
    );
  }
  return NextResponse.json(evidenceCard(siteOrigin(), asked as ChainId), {
    headers: { 'cache-control': 'public, max-age=300' },
  });
}
