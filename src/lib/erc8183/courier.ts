import 'server-only';

import { readAgentCard } from '@/lib/agents/agent-card';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { readJson, withPublicEndpoint } from '@/lib/proof/prober';
import type { PokterJobEnvelope } from './job-envelope';
import { extractAnswer, isPaidOnlyRefusal, isQuoteReply, pickWorkSkill, type AgentAnswer, type SkillChoice } from './courier-parse';

export interface CourierResult {
  answer: AgentAnswer;
  answeredBy: { chainId: number; tokenId: string; name: string | null; endpoint: string; skill: string };
  latencyMs: number;
  askedAt: string;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** Why an agent cannot be sent a brief at all: a fact about the agent, not a passing failure. */
export class NotAskableError extends Error {}

/** The agent answered with a price: it does the work only once paid through escrow. */
export class PaidOnlyError extends Error {}

export interface PreparedAgent {
  chainId: number;
  tokenId: string;
  category: string;
  name: string | null;
  serviceUrl: string;
  skill: SkillChoice;
}

/**
 * Resolve where a brief goes: the agent's card, its first skill that is
 * work rather than plumbing, and its service URL. Done once per agent, so a
 * check that sends several briefs reads the registry and the card once.
 * Throws NotAskableError when the agent publishes no endpoint or no work
 * skill; any other error (registry or network) is transient.
 */
export async function prepareAgent(target: { chainId: number; tokenId: string; category: string }): Promise<PreparedAgent> {
  const { chainId, tokenId } = target;
  const agent = await getAgent(chainId as ChainId, tokenId);
  const endpoint = agent.services?.a2a?.endpoint?.replace('{agentId}', tokenId);
  if (!endpoint) throw new NotAskableError('The agent publishes no A2A endpoint, so a brief cannot be sent to it.');

  const card = await readAgentCard(endpoint);
  const skill = pickWorkSkill(card?.skills);
  if (!skill || typeof card?.url !== 'string') throw new NotAskableError('The agent card declares no skill a brief can be sent to.');
  return { ...target, name: agent.name ?? null, serviceUrl: card.url, skill };
}

/**
 * Send one brief to a prepared agent and return what it said, over the
 * pinned, size-capped fetch the prober and the trial use. Read-only by
 * instruction. Throws when the agent answers with an error or with nothing.
 */
export async function sendPreparedBrief(
  agent: PreparedAgent,
  brief: { text: string; data?: Record<string, unknown> },
  { timeoutMs = 20_000, dataOnly = false }: { timeoutMs?: number; dataOnly?: boolean } = {},
): Promise<CourierResult> {
  const briefData = {
    skill: agent.skill.id,
    task: brief.text,
    task_description: brief.text,
    category: agent.category,
    read_only: true,
    constraints: 'Read-only analysis. Execute no transaction and move no funds.',
    ...brief.data,
  };
  const askedAt = new Date().toISOString();
  const started = Date.now();
  const payload = await withPublicEndpoint(agent.serviceUrl, async (service) => {
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
            // Some agents accept exactly one structured part; dataOnly sends that.
            parts: dataOnly ? [{ kind: 'data', data: briefData }] : [{ kind: 'text', text: brief.text }, { kind: 'data', data: briefData }],
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
  if (!answer) {
    if (isQuoteReply(object(object(payload.payload)?.result))) throw new PaidOnlyError('The agent answered with a price: it does this work only when paid through escrow.');
    throw new Error('The agent answered, but with no text and no data.');
  }
  if (isPaidOnlyRefusal(answer)) throw new PaidOnlyError('Asked directly, the agent offers only its escrow skills: it does this work only when paid through escrow.');
  return {
    answer,
    answeredBy: { chainId: agent.chainId, tokenId: agent.tokenId, name: agent.name, endpoint: payload.origin, skill: agent.skill.id },
    latencyMs: Date.now() - started,
    askedAt,
  };
}

/**
 * The courier: the brief goes to the agent the buyer chose, and what comes
 * back is what gets delivered.
 *
 * Pokter's seller stands in for agents that cannot see a testnet escrow. It
 * carries the buyer's brief to the agent and returns the agent's own answer.
 * Nothing is invented: if the agent does not answer, or answers with
 * nothing, this throws and nothing is delivered. The job then expires and
 * the buyer reclaims, which is the honest outcome.
 */
export async function askAgent(envelope: PokterJobEnvelope, jobId: string, options: { timeoutMs?: number } = {}): Promise<CourierResult> {
  const agent = await prepareAgent({ chainId: envelope.identity.chainId, tokenId: envelope.identity.tokenId, category: envelope.category });
  return sendPreparedBrief(agent, { text: envelope.task, data: { protocol: 'pokter-job', job_id: Number(jobId) } }, options);
}
