import { NextResponse } from 'next/server';

import { jsonRpcEndpoint } from '@/lib/a2a/card';
import { readAgentCard } from '@/lib/agents/agent-card';
import { previewSkillId } from '@/lib/agents/capabilities';
import { readA2AReply } from '@/lib/a2a/reply';
import { classifyQuoteError, describeQuoteFailure } from '@/lib/hire/failure';
import { readJson, withPublicEndpoint } from '@/lib/proof/prober';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

const MAX_TEXT = 4_000;

/**
 * An agent's own free preview, run with the buyer's brief before any payment.
 *
 * Only a skill the card itself marks as a free preview is called (IVL's
 * `preview`: "Free — no ERC-8183 job, no payment, no signing"), never the
 * paid job, and only for a registry agent, never an arbitrary URL. What
 * comes back is shown as the agent's preview answer: it says what the agent
 * understood from the brief, not what the paid job will deliver.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`preview:${requestClientKey(request)}`, { limit: 5, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Preview limit reached. Wait a moment before trying again.', layer: 'network', retryable: true }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const chainId = Number(body?.chainId) as ChainId;
  const tokenId = String(body?.tokenId ?? '');
  const task = String(body?.task ?? '').trim();
  if ((chainId !== 56 && chainId !== 97) || !/^\d{1,12}$/.test(tokenId)) {
    return NextResponse.json({ error: 'Invalid agent identifier.', layer: 'input' }, { status: 400 });
  }
  if (!task || task.length > 500) {
    return NextResponse.json({ error: 'A preview takes a brief of 1 to 500 characters.', layer: 'input' }, { status: 400 });
  }

  const agent = await getAgent(chainId, tokenId).catch(() => null);
  const name = agent?.name || `Agent #${tokenId}`;
  const endpoint = agent?.services?.a2a?.endpoint?.replace('{agentId}', tokenId);
  if (!agent || !endpoint) {
    return NextResponse.json({ error: `${name} publishes no A2A endpoint, so it has no preview to run.`, layer: 'seller', code: 'no-endpoint' }, { status: 409 });
  }

  try {
    const card = await readAgentCard(endpoint);
    const skill = previewSkillId(card.skills);
    if (!skill) {
      return NextResponse.json({ error: `${name} declares no free preview on its card.`, layer: 'seller', code: 'no-preview' }, { status: 409 });
    }
    // The card's JSON-RPC interface, in either card format, as every other call uses.
    const serviceUrl = jsonRpcEndpoint(card);
    if (!serviceUrl) {
      return NextResponse.json({ error: `${name}'s card offers no HTTPS JSON-RPC interface, which is the one Pokter calls.`, layer: 'seller', code: 'no-endpoint' }, { status: 409 });
    }
    const startedAt = Date.now();
    const rpcId = crypto.randomUUID();
    const payload = await withPublicEndpoint(serviceUrl, async (service) => {
      const response = await service.fetch({
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: rpcId,
          method: 'message/send',
          params: {
            message: { role: 'user', messageId: crypto.randomUUID(), parts: [{ kind: 'data', data: { skill, task_description: task } }] },
            configuration: { acceptedOutputModes: ['application/json', 'text/plain'], blocking: true },
          },
        }),
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Agent answered ${response.status}.`);
      return readJson(response, { expectId: rpcId });
    });
    const reply = readA2AReply(payload);
    const content = reply.data ? JSON.stringify(reply.data, null, 2) : reply.texts.join('\n\n');
    return NextResponse.json({
      skill,
      state: reply.state,
      // Progress, a request for input or a failure is reported as that, not as an answer.
      answer: reply.state === 'completed' && content ? content.slice(0, MAX_TEXT) : null,
      truncated: content.length > MAX_TEXT,
      status: reply.statusText,
      latencyMs: Date.now() - startedAt,
      observedAt: new Date().toISOString(),
    });
  } catch (error) {
    const failure = classifyQuoteError(error);
    const { message, status } = describeQuoteFailure(failure, name);
    return NextResponse.json({ error: message.replace('Try again shortly; nothing has been paid.', 'Try again shortly.'), layer: failure.layer, code: failure.code, retryable: failure.retryable }, { status });
  }
}
