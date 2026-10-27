import { NextResponse } from 'next/server';

import { a2aVersionUnsupported } from '@/lib/a2a/card';
import { isNegotiationSkill, priceLikeSkill } from '@/lib/erc8183/courier-parse';
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
  /*
   * The skill the requester would send a price request to, chosen the way
   * it chooses (by id), so passing here means Pokter will ask. MCP results
   * carry no card, so their tool names are judged by the same rule.
   */
  const quoteCapability = result.negotiationSkill !== undefined ? Boolean(result.negotiationSkill) : capabilities.some(isNegotiationSkill);
  const pricingNamedOtherwise = quoteCapability ? null : priceLikeSkill(result.skillIds ?? capabilities);
  /* A card that offers JSON-RPC only at A2A 1.x: Pokter asks in 0.3 and does not yet speak the newer wire format. */
  const a2aVersionNote = a2aVersionUnsupported(result.a2aVersion)
    ? `Its card offers JSON-RPC only at A2A ${result.a2aVersion}. Pokter asks in A2A 0.3 (message/send) and does not yet speak the newer wire format, so add an A2A 0.3 interface to be priced and hired.`
    : null;

  return NextResponse.json({
    ...result,
    protocol,
    endpoint,
    capabilities,
    quoteCapability,
    priceLikeSkill: pricingNamedOtherwise,
    a2aVersionNote,
    safety: {
      httpsRequired: true,
      credentialsRejected: true,
      dnsPinned: true,
      privateNetworksRejected: true,
      redirectsBlocked: true,
      timeoutMs: 10_000,
      responseLimitBytes: 256 * 1_024,
    },
  });
}
