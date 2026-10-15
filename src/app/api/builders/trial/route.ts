import { MCP_PROTOCOL_VERSION } from '@/lib/proof/probe-target';
import { NextResponse } from 'next/server';

import { interpretTrialResponse, selectTrialCapability } from '@/lib/builder/trial';
import { readJson, withPublicEndpoint } from '@/lib/proof/prober';
import { readAgentCard } from '@/lib/agents/agent-card';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { jsonRpcEndpoint } from '@/lib/a2a/card';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

/** Execute only an endpoint's explicitly advertised preview/dry-run capability. */

/**
 * An MCP call to an endpoint whose protocol revision is unknown.
 *
 * The builder is testing their own endpoint before it is registered, so
 * there is no record to read a revision from. Sending one anyway is what
 * broke the catalogue's probe: a server implementing an earlier revision
 * answers 400, and three working agents were recorded as unreachable for
 * it.
 *
 * So the header is omitted first, and sent only if the server refuses
 * without it. That is the order that cannot be worse than before — a
 * server wanting the revision still gets it, one revision later than it
 * implements still gets a chance, and a server happy without it is no
 * longer told something untrue about itself.
 */
async function mcpFetch(
  handle: { fetch: (init: RequestInit) => Promise<Response> },
  body: unknown,
  timeoutMs = 8_000,
): Promise<Response> {
  const send = (version?: string) =>
    handle.fetch({
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        ...(version ? { 'mcp-protocol-version': version } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });

  const first = await send();
  if (first.ok || first.status < 400 || first.status >= 500) return first;
  return send(MCP_PROTOCOL_VERSION);
}

export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`builder-trial:${requestClientKey(request)}`, {
    limit: 3,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Preview limit reached. Wait a moment before trying again.' },
      { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const endpoint = String(body.endpoint ?? '').trim();
  const protocol = body.protocol === 'a2a' ? 'a2a' : body.protocol === 'mcp' ? 'mcp' : null;
  const task = String(body.task ?? '').trim();

  if (!protocol || !endpoint || endpoint.length > 2_048) {
    return NextResponse.json({ error: 'A valid protocol and public HTTPS endpoint are required.' }, { status: 400 });
  }
  if (task.length < 10 || task.length > 500) {
    return NextResponse.json({ error: 'Preview task must be between 10 and 500 characters.' }, { status: 400 });
  }
  try {
    const startedAt = Date.now();
    let target = endpoint;
    let capability: string | null = null;
    if (protocol === 'a2a') {
      const card = await readAgentCard(endpoint);
      const callable = jsonRpcEndpoint(card);
      if (!callable) throw new Error('Agent Card publishes no HTTPS JSON-RPC interface, which is the one Pokter calls.');
      const published = Array.isArray(card.skills)
        ? card.skills.map((skill) => object(skill)?.id ?? object(skill)?.name).filter((value): value is string => typeof value === 'string')
        : [];
      capability = selectTrialCapability(published);
      target = callable;
    } else {
      const tools = await withPublicEndpoint(endpoint, async (handle) => {
        const response = await mcpFetch(handle, { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'tools/list', params: {} });
        if (!response.ok) throw new Error(`MCP handshake answered ${response.status}.`);
        return object(await readJson(response));
      });
      const listed = Array.isArray(object(tools?.result)?.tools)
        ? (object(tools?.result)?.tools as unknown[]).map((tool) => object(tool)?.name).filter((value): value is string => typeof value === 'string')
        : [];
      capability = selectTrialCapability(listed);
    }
    if (!capability) throw new Error('Endpoint does not currently advertise a supported preview, simulate or dry-run capability.');

    const call = protocol === 'mcp' ? {
      jsonrpc: '2.0', id: crypto.randomUUID(), method: 'tools/call',
      params: { name: capability, arguments: { task, dryRun: true } },
    } : {
      jsonrpc: '2.0', id: crypto.randomUUID(), method: 'message/send',
      params: {
        message: { role: 'user', messageId: crypto.randomUUID(), parts: [{ kind: 'data', data: { skill: capability, task, mode: 'dry-run' } }] },
        configuration: { acceptedOutputModes: ['application/json'], blocking: true },
      },
    };
    const payload = await withPublicEndpoint(target, async (handle) => {
      const response = protocol === 'mcp'
        ? await mcpFetch(handle, call, 12_000)
        : await handle.fetch({
            method: 'POST',
            headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
            body: JSON.stringify(call),
            cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000),
          });
      if (!response.ok) throw new Error(`Endpoint answered ${response.status} ${response.statusText}.`);
      return readJson(response);
    });
    const interpreted = interpretTrialResponse(payload);
    return NextResponse.json({
      ok: interpreted.valid,
      protocol,
      capability,
      latencyMs: Date.now() - startedAt,
      observedAt: new Date().toISOString(),
      summary: interpreted.summary,
      response: payload,
      disclaimer: 'Pokter supplied no wallet, key or transaction authority. The builder controls the tested runtime and remains responsible for ensuring its preview capability has no external side effects.',
    }, { status: interpreted.valid ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ error: `Preview failed: ${(error as Error).message}` }, { status: 502 });
  }
}
