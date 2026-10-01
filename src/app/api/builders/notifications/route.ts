import { NextRequest, NextResponse } from 'next/server';
import { getErc8183Job } from '@altananetwork/sdk';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { BUILDER_SESSION_COOKIE, builderSessionOwner } from '@/lib/builders/store';
import { getJobStore } from '@/lib/erc8183/store';
import { builderNotifications, markBuilderNotificationsRead, recordBuilderJobEvent } from '@/lib/notifications/server';
import { listAgents } from '@/lib/scan/client';
import type { ScanAgent } from '@/lib/scan/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

function owner(request: NextRequest) {
  return builderSessionOwner(request.cookies.get(BUILDER_SESSION_COOKIE)?.value);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rate = consumeRateLimit(`builder-inbox:${requestClientKey(request)}`, { limit: 12, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many inbox refreshes. Try again shortly.' }, { status: 429 });
  const builder = owner(request);
  if (!builder) return NextResponse.json({ error: 'Builder verification is required.' }, { status: 401 });
  const pages = await Promise.all([
    listAgents({ chainId: 56, ownerAddress: builder, limit: 100 }).catch(() => ({ items: [] as ScanAgent[] })),
    listAgents({ chainId: 97, ownerAddress: builder, limit: 100 }).catch(() => ({ items: [] as ScanAgent[] })),
  ]);
  const keys = new Set(pages.flatMap((page) => page.items).map((agent) => `${agent.chain_id}:${agent.token_id}`));
  const jobs = getJobStore().all().filter((job) => keys.has(`${job.agentChainId ?? 56}:${job.agentTokenId}`));
  await Promise.allSettled(jobs.map(async (job) => {
    const onchain = await getErc8183Job(ALTANA_NETWORK, BigInt(job.jobId));
    recordBuilderJobEvent({
      owner: builder, chainId: job.chainId, jobId: job.jobId, agentName: job.agentName,
      status: onchain.statusName, expiredAt: onchain.expiredAt,
    });
  }));
  const items = builderNotifications(builder);
  return NextResponse.json({ items, unread: items.filter((item) => !item.readAt).length }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const builder = owner(request);
  if (!builder) return NextResponse.json({ error: 'Builder verification is required.' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { id?: unknown };
  if (body.id !== undefined && (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id))) {
    return NextResponse.json({ error: 'Invalid notification id.' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id : undefined;
  return NextResponse.json({ updated: markBuilderNotificationsRead(builder, id) });
}
