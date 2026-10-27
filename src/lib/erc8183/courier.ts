import 'server-only';

import { readAgentCard } from '@/lib/agents/agent-card';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { readJson, withPublicEndpoint } from '@/lib/proof/prober';
import { outboundBriefData, outboundParts, skillRequestData } from './skill-request';
import type { PokterJobEnvelope } from './job-envelope';
import { extractAnswer, isPaidOnlyRefusal, isQuoteReply, pickWorkSkill, type AgentAnswer, type SkillChoice } from './courier-parse';
import { notAnAnswer, readA2AReply } from '@/lib/a2a/reply';
import { jsonRpcEndpoint } from '@/lib/a2a/card';

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
  /**
   * Every skill the card declared, as declared.
   *
   * Carried out of the one card read this function already does, so the
   * pre-funding compiler (`brief-compiler`) can read the chosen skill's
   * published input format without fetching the card a second time. A
   * second read is not just slower: an operator can change their card
   * between the two, and then the format a buyer approved against is not
   * the format the brief was resolved against.
   */
  skills: ReadonlyArray<{ id?: string; name: string; description?: string | null; examples: readonly string[] }>;
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
  if (!endpoint) throw new NotAskableError('No A2A endpoint found for the agent in the registry data Pokter reads, so a brief cannot be sent to it.');

  const card = await readAgentCard(endpoint);
  const skill = pickWorkSkill(card?.skills, target.category);
  const serviceUrl = jsonRpcEndpoint(card);
  if (!skill) throw new NotAskableError('The agent card declares no skill a brief can be sent to.');
  if (!serviceUrl) throw new NotAskableError('The agent card offers no HTTPS JSON-RPC interface, which is the one Pokter calls.');
  return { ...target, name: agent.name ?? null, serviceUrl, skill, skills: declaredSkillsOf(card) };
}

/**
 * The card's `skills`, read for their shape and nothing else.
 *
 * A card is a document an operator controls, so this takes four fields of
 * known types and ignores everything around them. No string from here is
 * ever executed, interpolated into an instruction, or allowed to decide what
 * a hire may do — see `RESERVED` in `brief-compiler`, which drops a declared
 * field name that would overwrite Pokter's own `read_only` and `constraints`.
 */
function declaredSkillsOf(card: Record<string, unknown> | null): PreparedAgent['skills'] {
  const skills = card?.skills;
  if (!Array.isArray(skills)) return [];
  const read: Array<{ id?: string; name: string; description?: string | null; examples: string[] }> = [];
  for (const entry of skills.slice(0, 24)) {
    const skill = object(entry);
    const id = typeof skill?.id === 'string' ? skill.id : undefined;
    const name = typeof skill?.name === 'string' ? skill.name : (id ?? '');
    if (!name) continue;
    read.push({
      id,
      name,
      description: typeof skill?.description === 'string' ? skill.description : null,
      /* Capped the same way `declaredCapabilities` caps them: an example is
         a short request, and a card is not a place Pokter accepts bulk from. */
      examples: (Array.isArray(skill?.examples) ? skill.examples : [])
        .filter((example): example is string => typeof example === 'string')
        .map((example) => example.trim())
        .filter((example) => example.length > 0 && example.length <= 400)
        .slice(0, 8),
    });
  }
  return read;
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
  /* Assembled in `skill-request` so the body a test asserts is this body. */
  const briefData = outboundBriefData({
    skillId: agent.skill.id,
    category: agent.category,
    task: brief.text,
    data: brief.data,
  });
  const askedAt = new Date().toISOString();
  const started = Date.now();
  const rpcId = crypto.randomUUID();
  const payload = await withPublicEndpoint(agent.serviceUrl, async (service) => {
    const response = await service.fetch({
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: rpcId,
        method: 'message/send',
        params: {
          message: {
            role: 'user',
            messageId: crypto.randomUUID(),
            parts: outboundParts({ task: brief.text, briefData }, { dataOnly }),
          },
          configuration: { acceptedOutputModes: ['application/json', 'text/plain'], blocking: true },
        },
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`The agent answered ${response.status} ${response.statusText}.`);
    return { payload: await readJson(response, { expectId: rpcId }), origin: service.url.origin };
  });

  const answer = extractAnswer(payload.payload);
  if (!answer) {
    // Say what the agent actually did, rather than "no answer".
    const pending = notAnAnswer(readA2AReply(payload.payload));
    if (pending) throw new Error(pending);
    if (isQuoteReply(object(object(payload.payload)?.result))) throw new PaidOnlyError('The agent answered with a price: it does this work only when paid through escrow.');
    throw new Error('The agent answered, but with no text and no data.');
  }
  if (isPaidOnlyRefusal(answer)) {
    throw new PaidOnlyError(
      answer.data?.preview === true
        ? 'Asked directly, the agent gives a priced preview: it does this work only when paid through escrow.'
        : 'Asked directly, the agent offers only its escrow skills: it does this work only when paid through escrow.',
    );
  }
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
  return askAgentByIdentity(
    { chainId: envelope.identity.chainId, tokenId: envelope.identity.tokenId, category: envelope.category, task: envelope.task },
    jobId,
    options,
  );
}

/**
 * The same ask, addressed by identity rather than by an envelope.
 *
 * A reference-format job carries no envelope — that is the whole of its
 * difference — and its identity is established from Pokter's index and the
 * registry instead. Synthesising an envelope to pass through here would mean
 * building the one structure whose absence is the thing being handled, so
 * the four fields `askAgent` actually used are taken directly.
 */
export async function askAgentByIdentity(
  brief: { chainId: number; tokenId: string; category: string; task: string },
  jobId: string,
  options: { timeoutMs?: number } = {},
): Promise<CourierResult> {
  const agent = await prepareAgent({ chainId: brief.chainId, tokenId: brief.tokenId, category: brief.category });
  /*
   * The structured request this skill is actually sent, decided by the same
   * code the quote route runs before the escrow is funded.
   *
   * `agent_evidence` reads its subject from `data.agent`. Sending prose
   * alone made it fall back to parsing the whole task description as a
   * reference and answer 400: job 1585 failed that way on every run for a
   * day with its escrow funded. The subject is read from the signed brief,
   * which names it outright, and a brief that names none or names two is
   * refused rather than chosen between on the buyer's behalf. The full
   * brief still travels as `task` and `task_description`.
   */
  const request = skillRequestData({ skillId: agent.skill.id, task: brief.task, jobId });
  if (!request.ok) throw new NotAskableError(request.message);

  return sendPreparedBrief(agent, { text: brief.task, data: request.data }, options);
}
