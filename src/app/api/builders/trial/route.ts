import { NextResponse } from 'next/server';

import { interpretTrialResponse, selectTrialCapability } from '@/lib/builder/trial';
import { readJson, withPublicEndpoint } from '@/lib/proof/prober';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

/** Execute only an endpoint's explicitly advertised preview/dry-run capability. */
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
      const card = await withPublicEndpoint(endpoint, async (handle) => {
        const response = await handle.fetch({
          headers: { accept: 'application/json' }, cache: 'no-store', redirect: 'error',
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error(`Agent Card answered ${response.status}.`);
        return object(await readJson(response));
      });
      if (typeof card?.url !== 'string') throw new Error('Agent Card publishes no service URL.');
      const published = Array.isArray(card.skills)
        ? card.skills.map((skill) => object(skill)?.id ?? object(skill)?.name).filter((value): value is string => typeof value === 'string')
        : [];
      capability = selectTrialCapability(published);
      target = card.url;
    } else {
      const tools = await withPublicEndpoint(endpoint, async (handle) => {
        const response = await handle.fetch({
          method: 'POST',
          headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json', 'mcp-protocol-version': '2026-07-28' },
          body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method: 'tools/list', params: {} }),
          cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error(`MCP handshake answered ${response.status}.`);
        return object(await readJson(response));
      });
      const listed = Array.isArray(object(tools?.result)?.tools)
        ? (object(tools?.result)?.tools as unknown[]).map((tool) => object(tool)?.name).filter((value): value is string => typeof value === 'string')
        : [];
      capability = selectTrialCapability(listed);
    }
    if (!capability) throw new Error('Endpoint does not currently advertise a supported preview, simulate or dry-run capability.');

    const payload = await withPublicEndpoint(target, async (handle) => {
      const response = await handle.fetch({
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          ...(protocol === 'mcp' ? { 'mcp-protocol-version': '2026-07-28' } : {}),
        },
        body: JSON.stringify(protocol === 'mcp' ? {
          jsonrpc: '2.0', id: crypto.randomUUID(), method: 'tools/call',
          params: { name: capability, arguments: { task, dryRun: true } },
        } : {
          jsonrpc: '2.0', id: crypto.randomUUID(), method: 'message/send',
          params: {
            message: { role: 'user', messageId: crypto.randomUUID(), parts: [{ kind: 'data', data: { skill: capability, task, mode: 'dry-run' } }] },
            configuration: { acceptedOutputModes: ['application/json'], blocking: true },
          },
        }),
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
