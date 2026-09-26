import { NextResponse } from 'next/server';

import { submitDemoDeliverable } from '@/lib/erc8183/demo-seller';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`seller:${requestClientKey(request)}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Seller request limit reached.' },
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
      { error: 'Expected JSON-RPC JSON.' },
      { status: 400 },
    );
  }
  const id = body.id ?? null;
  const params = object(body.params);
  const message = object(params?.message);
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  const data = parts.map((part) => object(object(part)?.data)).find(Boolean);
  const jobId = String(data?.job_id ?? '');
  const validJobId =
    /^\d+$/.test(jobId) && BigInt(jobId) <= BigInt(Number.MAX_SAFE_INTEGER);

  if (
    body.jsonrpc !== '2.0' ||
    body.method !== 'message/send' ||
    data?.skill !== 'notify_funded' ||
    !validJobId
  ) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: 'Invalid notify_funded request.' },
      },
      { status: 400 },
    );
  }

  try {
    const delivery = await submitDemoDeliverable(jobId);
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        kind: 'message',
        role: 'agent',
        messageId: crypto.randomUUID(),
        parts: [{ kind: 'data', data: delivery }],
      },
    });
  } catch (error) {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        kind: 'message',
        role: 'agent',
        messageId: crypto.randomUUID(),
        parts: [
          {
            kind: 'data',
            data: {
              status: 'rejected',
              jobId,
              reason: (error as Error).message,
            },
          },
        ],
      },
    });
  }
}
