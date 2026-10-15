import { NextResponse } from 'next/server';

import { HouseAgentNotConfigured } from '@/lib/house/keys';
import { registerHouseAgent } from '@/lib/house/register';
import { houseAgent } from '@/lib/house/registry';
import { HOUSE_CHAINS, type HouseChainId } from '@/lib/house/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Register a house agent on one chain. Operator-only, behind the sweep's
 * secret, and meant to be called from inside the server (see the PR notes)
 * so the secret never leaves it. Idempotent: a second call reports the
 * existing registration and sends nothing.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.SWEEP_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { slug?: unknown; chainId?: unknown; recoverFromTx?: unknown };
  const definition = houseAgent(String(body.slug ?? ''));
  const chainId = Number(body.chainId);
  if (!definition) return NextResponse.json({ error: 'No such house agent.' }, { status: 404 });
  if (!(HOUSE_CHAINS as readonly number[]).includes(chainId)) return NextResponse.json({ error: 'chainId must be 56 or 97.' }, { status: 400 });
  try {
    const recoverFromTx = typeof body.recoverFromTx === 'string' && /^0x[0-9a-fA-F]{64}$/.test(body.recoverFromTx) ? (body.recoverFromTx as `0x${string}`) : undefined;
    return NextResponse.json(await registerHouseAgent(definition, chainId as HouseChainId, { recoverFromTx }));
  } catch (error) {
    const status = error instanceof HouseAgentNotConfigured ? 409 : 502;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}
