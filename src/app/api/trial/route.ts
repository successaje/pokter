import { NextResponse } from 'next/server';

import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { readJson, withPublicEndpoint } from '@/lib/proof/prober';
import { negotiationTermsBound, verifyNegotiationSignature } from '@/lib/erc8183/negotiation';
import {
  consumeRateLimit,
  requestClientKey,
} from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function responseData(payload: unknown): Record<string, unknown> | null {
  const root = object(payload);
  const result = object(root?.result);
  const parts = Array.isArray(result?.parts) ? result.parts : [];
  for (const part of parts) {
    const data = object(object(part)?.data);
    if (data) return data;
  }
  return null;
}

/**
 * Read-only A2A negotiation trial.
 *
 * The caller identifies a registry agent, never an arbitrary URL. Pokter then
 * checks that the agent explicitly publishes the `negotiate` skill and sends a
 * fixed non-transactional message. No wallet, signature or on-chain write is
 * involved.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const client = requestClientKey(request);
  const rate = consumeRateLimit(`trial:${client}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Trial limit reached. Wait a moment before trying again.' },
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
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const chainId = Number(body.chainId) as ChainId;
  const tokenId = String(body.tokenId ?? '');
  const task = String(body.task ?? '').trim();
  if ((chainId !== 56 && chainId !== 97) || !/^\d+$/.test(tokenId)) {
    return NextResponse.json({ error: 'Invalid agent identifier.' }, { status: 400 });
  }
  if (task.length < 10 || task.length > 500) {
    return NextResponse.json(
      { error: 'Trial task must be between 10 and 500 characters.' },
      { status: 400 },
    );
  }

  try {
    const agent = await getAgent(chainId, tokenId);
    const endpoint = agent.services?.a2a?.endpoint?.replace('{agentId}', tokenId);
    if (!endpoint) {
      return NextResponse.json(
        { error: 'This agent does not publish an A2A endpoint.' },
        { status: 409 },
      );
    }

    const card = await withPublicEndpoint(endpoint, async (cardEndpoint) => {
      const cardResponse = await cardEndpoint.fetch({
        headers: { accept: 'application/json' },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
      });
      if (!cardResponse.ok)
        throw new Error(`Agent Card answered ${cardResponse.status}.`);
      return object(await readJson(cardResponse));
    });
    const skills = Array.isArray(card?.skills) ? card.skills : [];
    const canNegotiate = skills.some((skill) => {
      const value = object(skill);
      return value?.id === 'negotiate' || value?.name === 'negotiate';
    });

    if (!canNegotiate || typeof card?.url !== 'string') {
      return NextResponse.json(
        { error: 'This agent does not publish a safe negotiation trial.' },
        { status: 409 },
      );
    }

    const startedAt = Date.now();
    const serviceResult = await withPublicEndpoint(
      card.url,
      async (service) => {
        const response = await service.fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
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
                    data: {
                      skill: 'negotiate',
                      task_description: task,
                      terms: {
                        deliverables: 'A JSON assessment with assumptions and data sources.',
                        quality_standards:
                          'Read-only analysis only. Execute no transaction and move no funds.',
                      },
                    },
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
        if (!response.ok)
          throw new Error(`Agent answered ${response.status} ${response.statusText}.`);
        return { payload: await readJson(response), origin: service.url.origin };
      },
    );
    const data = responseData(serviceResult.payload);
    if (
      !data ||
      typeof data.negotiation_hash !== 'string' ||
      typeof data.provider_sig !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Agent answered, but did not return a signed negotiation receipt.' },
        { status: 502 },
      );
    }
    if (!agent.agent_wallet) {
      return NextResponse.json(
        { error: 'The ERC-8004 identity publishes no provider wallet for signature verification.' },
        { status: 409 },
      );
    }
    const verifiedSigner = await verifyNegotiationSignature({
      negotiationHash: data.negotiation_hash,
      providerSignature: data.provider_sig,
      expectedProvider: agent.agent_wallet,
    });

    return NextResponse.json({
      receipt: data,
      verifiedSigner,
      // Whether the signed hash is the hash of these terms (price, acceptance,
      // task). Without it the signature proves only who answered.
      termsBound: negotiationTermsBound(data as Record<string, unknown>, task),
      latencyMs: Date.now() - startedAt,
      endpoint: serviceResult.origin,
      observedAt: new Date().toISOString(),
      disclaimer:
        'The EIP-191 quote signature matches the selected ERC-8004 provider wallet. This does not prove investment performance or execute a transaction.',
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Trial failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
