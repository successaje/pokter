import { NextResponse } from 'next/server';
import { getErc8183DeliverableUrl, getErc8183Job } from '@altananetwork/sdk';

import { ALTANA_NETWORK, IS_TESTNET } from '@/lib/altana/client';
import { decodePokterJobEnvelope } from '@/lib/erc8183/job-envelope';
import { getJobStore } from '@/lib/erc8183/store';
import type { HiredJob } from '@/lib/erc8183/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface BackfillResult {
  jobId: string;
  action: 'insert' | 'refresh' | 'skip';
  status?: string;
  identity?: string;
  reason?: string;
}

/**
 * Dry-run-by-default repair and import endpoint for the persistent Fly index.
 * It never trusts identity or status supplied by the caller: both are read
 * from ERC-8183 and the immutable Pokter envelope.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.SWEEP_SECRET;
  if (!secret) return NextResponse.json({ error: 'SWEEP_SECRET is not configured.' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 }); }

  const rawIds = Array.isArray(body.jobIds) ? body.jobIds : [];
  const jobIds = [...new Set(rawIds.map(String))];
  const write = body.write === true;
  if (jobIds.length === 0 || jobIds.length > 100 || jobIds.some((id) => !/^\d+$/.test(id))) {
    return NextResponse.json({ error: 'jobIds must contain 1–100 numeric ERC-8183 job IDs.' }, { status: 400 });
  }

  const store = getJobStore();
  const results: BackfillResult[] = [];
  for (const jobId of jobIds) {
    try {
      const onchain = await getErc8183Job(ALTANA_NETWORK, BigInt(jobId));
      const envelope = decodePokterJobEnvelope(onchain.description);
      if (!envelope) {
        results.push({ jobId, action: 'skip', reason: 'No valid Pokter identity envelope.' });
        continue;
      }

      const existing = store.all().find((job) => job.chainId === ALTANA_NETWORK.chainId && job.jobId === jobId);
      const now = new Date().toISOString();
      const deliverableUrl = ['SUBMITTED', 'COMPLETED'].includes(onchain.statusName)
        ? await getErc8183DeliverableUrl(ALTANA_NETWORK, BigInt(jobId)).catch(() => undefined)
        : undefined;
      const indexed: HiredJob = {
        id: existing?.id ?? `${ALTANA_NETWORK.chainId}:${jobId}`,
        jobId, chainId: ALTANA_NETWORK.chainId, isTestnet: IS_TESTNET,
        agentChainId: envelope.identity.chainId,
        agentTokenId: envelope.identity.tokenId,
        agentName: envelope.identity.name ?? existing?.agentName ?? `Agent #${envelope.identity.tokenId}`,
        providerLabel: envelope.providerLabel ?? existing?.providerLabel,
        provider: onchain.provider,
        task: envelope.task,
        budgetRaw: onchain.budget.toString(),
        expiredAt: new Date(Number(onchain.expiredAt) * 1000).toISOString(),
        hiredAt: existing?.hiredAt ?? now,
        hireTxHash: existing?.hireTxHash ?? null,
        status: onchain.statusName,
        statusCheckedAt: now,
        deliverableUrl: deliverableUrl ?? existing?.deliverableUrl ?? null,
        settleTxHash: existing?.settleTxHash ?? null,
        disputeTxHash: existing?.disputeTxHash ?? null,
      };
      if (write) store.record(indexed);
      results.push({
        jobId, action: existing ? 'refresh' : 'insert', status: onchain.statusName,
        identity: `${envelope.identity.chainId}:${envelope.identity.tokenId}`,
      });
    } catch (error) {
      results.push({ jobId, action: 'skip', reason: (error as Error).message });
    }
  }

  return NextResponse.json({
    dryRun: !write,
    chainId: ALTANA_NETWORK.chainId,
    requested: jobIds.length,
    writable: write,
    results,
  });
}
