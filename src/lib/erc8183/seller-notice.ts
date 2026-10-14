import 'server-only';

import { readAgentCard } from '@/lib/agents/agent-card';
import { sendOperatorAlert } from '@/lib/alerts/operator';
import { getJobStore, type SellerNotice, type SellerNoticeStatus } from '@/lib/erc8183/store';
import { readJson, withPublicEndpoint } from '@/lib/proof/prober';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function agentReply(payload: unknown): Record<string, unknown> | null {
  const result = object(object(payload)?.result);
  const parts = Array.isArray(result?.parts) ? result.parts : [];
  for (const part of parts) {
    const data = object(object(part)?.data);
    if (data) return data;
  }
  return null;
}

async function askSeller(input: {
  agentChainId: ChainId;
  tokenId: string;
  jobId: string;
  provider: string;
}): Promise<{ status: SellerNoticeStatus; reason: string | null }> {
  const agent = await getAgent(input.agentChainId, input.tokenId);
  if (agent.agent_wallet?.toLowerCase() !== input.provider) {
    return { status: 'unreachable', reason: 'The registry agent and the funded job do not name the same provider.' };
  }
  const cardEndpoint = agent.services?.a2a?.endpoint?.replace('{agentId}', input.tokenId);
  if (!cardEndpoint) return { status: 'unreachable', reason: 'The provider publishes no A2A agent card.' };
  const card = await readAgentCard(cardEndpoint);
  const skills = Array.isArray(card?.skills) ? card.skills : [];
  if (!skills.some((skill) => object(skill)?.id === 'notify_funded') || typeof card?.url !== 'string') {
    return { status: 'unreachable', reason: 'The provider does not publish notify_funded, so it has to find the job on chain itself.' };
  }

  const reply = await withPublicEndpoint(card.url, async (service) => {
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
            parts: [{ kind: 'data', data: { skill: 'notify_funded', job_id: Number(input.jobId) } }],
          },
          configuration: { acceptedOutputModes: ['application/json'], blocking: true },
        },
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`The seller answered HTTP ${response.status}.`);
    return agentReply(await readJson(response));
  });
  if (!reply || (reply.status !== 'accepted' && reply.status !== 'rejected')) {
    return { status: 'unreachable', reason: 'The seller answered without saying whether it accepted the job.' };
  }
  const reason = typeof reply.reason === 'string' ? reply.reason.trim().slice(0, 500) || null : null;
  return { status: reply.status, reason };
}

/**
 * Tell a seller its job is funded, and keep what it said.
 *
 * The seller's answer used to be reduced to a status and then dropped, so
 * a refusal with a precise reason ("no signed quote anchored in job
 * description") reached nobody: the buyer watched "Waiting for the agent
 * to deliver" for a day and the job expired. The answer is now recorded
 * against the job, shown on its page, and a refusal or a seller Pokter
 * could not reach is sent to the team the first time it happens.
 *
 * Called by the hire page straight after funding and by the sweep for any
 * funded job that has no answer yet, so closing the tab no longer means
 * the seller is never told.
 */
export async function noticeSeller(input: {
  agentChainId: ChainId;
  tokenId: string;
  jobId: string;
  provider: string;
  escrowChainId: number;
  agentName?: string;
}): Promise<SellerNotice> {
  const answer = await askSeller(input).catch((error: unknown) => ({
    status: 'unreachable' as const,
    reason: error instanceof Error ? error.message.slice(0, 300) : 'The seller could not be reached.',
  }));
  const store = getJobStore();
  const before = store.noticeFor(input.escrowChainId, input.jobId);
  const notice = store.recordNotice({ chainId: input.escrowChainId, jobId: input.jobId, ...answer });

  if (answer.status !== 'accepted' && before?.status !== answer.status) {
    const who = input.agentName ?? `${input.agentChainId}/${input.tokenId}`;
    await sendOperatorAlert({
      subject: answer.status === 'rejected' ? `${who} refused job #${input.jobId}` : `Could not tell ${who} about job #${input.jobId}`,
      body: [
        `Job #${input.jobId} on chain ${input.escrowChainId} is funded.`,
        answer.status === 'rejected' ? `The seller refused it: ${answer.reason ?? 'no reason given'}.` : `Pokter could not get an answer: ${answer.reason ?? 'unknown'}.`,
        'The buyer sees this on the job page. The escrow can be reclaimed after the deadline.',
      ].join('\n'),
    }).catch(() => undefined);
  }
  return notice;
}
