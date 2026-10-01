import { NextResponse } from 'next/server';

import { probeEndpoint } from '@/lib/proof/prober';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/** Probe an unpublished agent endpoint without registering or mutating it. */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`builder-preflight:${requestClientKey(request)}`, {
    limit: 4,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Endpoint check limit reached. Wait a moment before trying again.' },
      { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const endpoint = String(body.endpoint ?? '').trim();
  const protocol = body.protocol === 'mcp' ? 'mcp' : body.protocol === 'a2a' ? 'a2a' : null;
  if (!protocol) {
    return NextResponse.json({ error: 'Protocol must be A2A or MCP.' }, { status: 400 });
  }
  if (!endpoint || endpoint.length > 2_048) {
    return NextResponse.json({ error: 'Enter a valid public HTTPS endpoint.' }, { status: 400 });
  }

  const result = await probeEndpoint(endpoint, protocol);
  const capabilities = result.capabilities ?? [];
  const quoteCapability = capabilities.some((capability) =>
    /(?:negotiate|quote|price)/i.test(capability),
  );

  return NextResponse.json({
    ...result,
    protocol,
    endpoint,
    capabilities,
    quoteCapability,
  });
}
