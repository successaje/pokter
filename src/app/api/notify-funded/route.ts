import { NextResponse } from 'next/server';
import { getErc8183Job } from '@altananetwork/sdk';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { isDemoSeller, submitDemoDeliverable } from '@/lib/erc8183/demo-seller';
import { readJson, withPublicEndpoint } from '@/lib/proof/prober';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function agentReply(payload: unknown): Record<string, unknown> | null {
  const result = object(object(payload)?.result);
  const parts = Array.isArray(result?.parts) ? result.parts : [];
  for (const part of parts) {
    const data = object(object(part)?.data);
    if (data) return data;
  }
  return null;
}

/** Verify FUNDED on-chain, then notify the matching seller over A2A. */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`notify:${requestClientKey(request)}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Notification limit reached. Try again shortly.' },
      {
        status: 429,
        headers: { 'retry-after': String(rate.retryAfterSeconds) },
      },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Expected a JSON body.' },
      { status: 400 },
    );
  }

  const chainId = Number(body.chainId) as ChainId;
  const tokenId = String(body.tokenId ?? '');
  const jobId = String(body.jobId ?? '');
  const provider = String(body.provider ?? '').toLowerCase();
  if (
    chainId !== ALTANA_NETWORK.chainId ||
    !/^\d+$/.test(tokenId) ||
    !/^\d+$/.test(jobId) ||
    !/^0x[0-9a-f]{40}$/.test(provider)
  ) {
    return NextResponse.json(
      { error: 'Agent, provider and escrow must be on the configured chain.' },
      { status: 400 },
    );
  }
  if (BigInt(jobId) > BigInt(Number.MAX_SAFE_INTEGER)) {
    return NextResponse.json(
      { error: 'This seller only accepts numeric job identifiers.' },
      { status: 400 },
    );
  }

  try {
    const job = await getErc8183Job(ALTANA_NETWORK, BigInt(jobId));
    if (job.provider.toLowerCase() !== provider) {
      return NextResponse.json(
        { error: 'The funded job does not name the requested provider.' },
        { status: 409 },
      );
    }
    if (job.statusName !== 'FUNDED') {
      return NextResponse.json(
        { error: `Job is ${job.statusName}, not FUNDED.` },
        { status: 409 },
      );
    }

    if (await isDemoSeller(provider)) {
      const delivery = await submitDemoDeliverable(jobId);
      return NextResponse.json({
        ...delivery,
        notifiedAt: new Date().toISOString(),
      });
    }

    const agent = await getAgent(chainId, tokenId);
    if (agent.agent_wallet?.toLowerCase() !== provider) {
      return NextResponse.json(
        {
          error:
            'The registry agent and funded job do not name the same provider.',
        },
        { status: 409 },
      );
    }

    const cardEndpoint = agent.services?.a2a?.endpoint?.replace(
      '{agentId}',
      tokenId,
    );
    if (!cardEndpoint) {
      return NextResponse.json(
        { error: 'The funded provider publishes no A2A Agent Card.' },
        { status: 409 },
      );
    }
    const card = await withPublicEndpoint(cardEndpoint, async (card_) => {
      const cardResponse = await card_.fetch({
        headers: { accept: 'application/json' },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
      });
      if (!cardResponse.ok)
        throw new Error(`Agent Card answered ${cardResponse.status}`);
      return object(await readJson(cardResponse));
    });
    const skills = Array.isArray(card?.skills) ? card.skills : [];
    const supportsNotification = skills.some(
      (skill) => object(skill)?.id === 'notify_funded',
    );
    if (!supportsNotification || typeof card?.url !== 'string') {
      return NextResponse.json(
        { error: 'The funded provider does not publish notify_funded.' },
        { status: 409 },
      );
    }

    const reply = await withPublicEndpoint(card.url, async (service) => {
      const response = await service.fetch({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: crypto.randomUUID(),
          method: 'message/send',
          params: {
            message: {
              role: 'user',
              messageId: crypto.randomUUID(),
              parts: [
                {
                  kind: 'data',
                  data: { skill: 'notify_funded', job_id: Number(jobId) },
                },
              ],
            },
            configuration: {
              acceptedOutputModes: ['application/json'],
              blocking: true,
            },
          },
        }),
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`Seller answered ${response.status}`);
      return agentReply(await readJson(response));
    });
    if (
      !reply ||
      (reply.status !== 'accepted' && reply.status !== 'rejected')
    ) {
      throw new Error('Seller returned no delivery acceptance status');
    }

    return NextResponse.json({
      status: reply.status,
      jobId,
      notifiedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Seller notification failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
