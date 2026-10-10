import { NextResponse } from 'next/server';
import { isAddress } from 'viem';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { getJobStore } from '@/lib/erc8183/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * The jobs one wallet funded through Pokter, from the index.
 *
 * Without it a wallet's history lived only in the browser that hired, so
 * the same MetaMask on a second device showed no hires, and Set and Earn
 * progress read zero. The funder is recorded from chain, never from a
 * caller, and every field here is already public on chain. The one
 * exception is the brief of jobs hired before briefs were sealed into the
 * on-chain envelope (rows with no agent chain): that is withheld, as the
 * single-job lookup withholds it.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`jobs-by-client:${requestClientKey(request)}`, { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  const client = new URL(request.url).searchParams.get('client') ?? '';
  if (!isAddress(client)) return NextResponse.json({ error: 'A wallet address is required.' }, { status: 400 });

  const jobs = getJobStore()
    .byClient(client)
    .filter((job) => job.chainId === ALTANA_NETWORK.chainId)
    .slice(0, 200)
    .map((job) => (job.agentChainId == null ? { ...job, task: '' } : job));
  return NextResponse.json({ jobs }, { headers: { 'cache-control': 'no-store' } });
}
