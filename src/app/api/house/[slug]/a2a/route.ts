import { NextResponse } from 'next/server';

import { siteOrigin } from '@/lib/evidence/origin';
import { houseCard } from '@/lib/house/card';
import { houseAgent } from '@/lib/house/registry';
import { handleHouseRpc } from '@/lib/house/rpc';
import { HOUSE_CHAINS, type HouseChainId } from '@/lib/house/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
// Delivery runs the work and waits for the submission before answering.
export const maxDuration = 60;

type Params = { params: Promise<{ slug: string }> };

function chainParam(request: Request): string | null {
  return new URL(request.url).searchParams.get('chain');
}

export async function GET(request: Request, { params }: Params): Promise<NextResponse> {
  const definition = houseAgent((await params).slug);
  if (!definition) return NextResponse.json({ error: 'No such agent.' }, { status: 404 });
  const asked = Number(chainParam(request));
  const chainId = (HOUSE_CHAINS as readonly number[]).includes(asked) ? (asked as HouseChainId) : undefined;
  return NextResponse.json(houseCard(definition, siteOrigin(), chainId), { headers: { 'cache-control': 'public, max-age=300' } });
}

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  const definition = houseAgent((await params).slug);
  if (!definition) return NextResponse.json({ error: 'No such agent.' }, { status: 404 });
  const rate = consumeRateLimit(`house:${definition.slug}:${requestClientKey(request)}`, { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Request limit reached.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected JSON-RPC JSON.' }, { status: 400 });
  }
  const reply = await handleHouseRpc(definition, body, chainParam(request));
  return NextResponse.json(reply.body, { status: reply.status });
}
