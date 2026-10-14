import { NextResponse } from 'next/server';

import { siteOrigin } from '@/lib/evidence/origin';
import { houseCard } from '@/lib/house/card';
import { houseAgent } from '@/lib/house/registry';
import { HOUSE_CHAINS, type HouseChainId } from '@/lib/house/types';

export const dynamic = 'force-dynamic';

/**
 * The card each chain's registration points at. Its endpoint carries the
 * chain, so a quote asked through it is priced in that chain's token
 * without the caller naming one.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; chainId: string }> }): Promise<NextResponse> {
  const { slug, chainId } = await params;
  const definition = houseAgent(slug);
  const asked = Number(chainId);
  if (!definition || !(HOUSE_CHAINS as readonly number[]).includes(asked)) {
    return NextResponse.json({ error: 'No such agent on that chain.' }, { status: 404 });
  }
  return NextResponse.json(houseCard(definition, siteOrigin(), asked as HouseChainId), { headers: { 'cache-control': 'public, max-age=300' } });
}
