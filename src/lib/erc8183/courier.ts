import 'server-only';

import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { readJson, withPublicEndpoint } from '@/lib/proof/prober';
import type { PokterJobEnvelope } from './job-envelope';
import { extractAnswer, pickWorkSkill, type AgentAnswer } from './courier-parse';

export interface CourierResult {
  answer: AgentAnswer;
  answeredBy: { chainId: number; tokenId: string; name: string | null; endpoint: string; skill: string };
  latencyMs: number;
  askedAt: string;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * The courier: the brief goes to the agent the buyer chose, and what comes
 * back is what gets delivered.
 *
 * Pokter's seller stands in for agents that cannot see a testnet escrow, and
 * until now it delivered a receipt of its own with no assessment in it. It
 * now carries the buyer's brief to the agent's A2A endpoint, over the same
 * pinned, size-capped fetch the prober and the trial use, and returns the
 * agent's own answer. Nothing is invented: if the agent does not answer, or
 * answers with nothing, this throws and nothing is delivered. The job then
 * expires and the buyer reclaims, which is the honest outcome.
 */
export async function askAgent(envelope: PokterJobEnvelope, jobId: string, { timeoutMs = 20_000 }: { timeoutMs?: number } = {}): Promise<CourierResult> {
  const { chainId, tokenId } = envelope.identity;
  const agent = await getAgent(chainId as ChainId, tokenId);
  const endpoint = agent.services?.a2a?.endpoint?.replace('{agentId}', tokenId);
  if (!endpoint) throw new Error('The agent publishes no A2A endpoint, so its brief cannot be carried to it.');

  const card = await withPublicEndpoint(endpoint, async (handle) => {
    const response = await handle.fetch({ headers: { accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`The agent card answered ${response.status}.`);
    return object(await readJson(response));
  });
  const skill = pickWorkSkill(card?.skills);
  if (!skill || typeof card?.url !== 'string') throw new Error('The agent card declares no skill a brief can be sent to.');

  const askedAt = new Date().toISOString();
  const started = Date.now();
  const payload = await withPublicEndpoint(card.url, async (service) => {
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
              { kind: 'text', text: envelope.task },
              {
                kind: 'data',
                data: {
                  skill: skill.id,
                  task: envelope.task,
                  task_description: envelope.task,
                  protocol: 'pokter-job',
                  job_id: Number(jobId),
                  category: envelope.category,
                  read_only: true,
                  constraints: 'Read-only analysis. Execute no transaction and move no funds.',
                },
              },
            ],
          },
          configuration: { acceptedOutputModes: ['application/json', 'text/plain'], blocking: true },
        },
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`The agent answered ${response.status} ${response.statusText}.`);
    return { payload: await readJson(response), origin: service.url.origin };
  });

  const answer = extractAnswer(payload.payload);
  if (!answer) throw new Error('The agent answered, but with no text and no data to deliver.');
  return {
    answer,
    answeredBy: { chainId, tokenId, name: agent.name ?? null, endpoint: payload.origin, skill: skill.id },
    latencyMs: Date.now() - started,
    askedAt,
  };
}
