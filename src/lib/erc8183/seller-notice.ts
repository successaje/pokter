import 'server-only';

import { readA2AReply } from '@/lib/a2a/reply';
import { readAgentCard } from '@/lib/agents/agent-card';
import { sendOperatorAlert } from '@/lib/alerts/operator';
import { getJobStore, type SellerNotice, type SellerNoticeStatus } from '@/lib/erc8183/store';
import { noticeReplyData, readNoticeReply } from '@/lib/erc8183/notice-reply';
import { readJson, withPublicEndpoint } from '@/lib/proof/prober';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { jsonRpcEndpoint } from '@/lib/a2a/card';
import { a2aUserMessage } from '@/lib/a2a/message';
import { registeredAgentWallet } from '@/lib/registry/live-agent';

export const SELLER_ANSWER_TIMEOUT_MS = 50_000;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function agentReply(payload: unknown): Record<string, unknown> | null {
  // The seller's answer to the notice: a message, a task, or the bare result.
  return noticeReplyData(payload);
}

async function askSeller(input: {
  agentChainId: ChainId;
  tokenId: string;
  jobId: string;
  provider: string;
}): Promise<{ status: SellerNoticeStatus; reason: string | null; deliverableUrl: string | null }> {
  const agent = await getAgent(input.agentChainId, input.tokenId);
  /* The wallet the registry names now, as the hire that funded the job read it (`registeredAgentWallet`): the indexer's copy can trail it. */
  const registered = await registeredAgentWallet(agent);
  if (registered?.toLowerCase() !== input.provider.toLowerCase()) {
    return { status: 'unreachable', reason: 'The registry agent and the funded job do not name the same provider.', deliverableUrl: null };
  }
  const cardEndpoint = agent.services?.a2a?.endpoint?.replace('{agentId}', input.tokenId);
  if (!cardEndpoint) return { status: 'unreachable', reason: 'The provider publishes no A2A agent card.', deliverableUrl: null };
  const card = await readAgentCard(cardEndpoint);
  const skills = Array.isArray(card?.skills) ? card.skills : [];
  if (!skills.some((skill) => object(skill)?.id === 'notify_funded') || !jsonRpcEndpoint(card)) {
    return { status: 'unreachable', reason: 'The provider does not publish notify_funded, so it has to find the job on chain itself.', deliverableUrl: null };
  }

  const rpcId = crypto.randomUUID();
  const payload = await withPublicEndpoint(jsonRpcEndpoint(card) as string, async (service) => {
    const response = await service.fetch({
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: rpcId,
        method: 'message/send',
        params: {
          message: a2aUserMessage([{ kind: 'data', data: { skill: 'notify_funded', job_id: Number(input.jobId) } }]),
          configuration: { acceptedOutputModes: ['application/json'], blocking: true },
        },
      }),
      cache: 'no-store',
      redirect: 'error',
      /*
       * Long, on purpose. Sellers on the reference pattern do the work and
       * submit it before they answer: Sluicegate delivered job 56997 five
       * seconds after Pokter stopped waiting at 12, and the buyer was told
       * the agent could not be reached.
       */
      signal: AbortSignal.timeout(SELLER_ANSWER_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`The seller answered HTTP ${response.status}.`);
    return readJson(response, { expectId: rpcId });
  });
  const read = readNoticeReply(agentReply(payload));
  if (read) return read;
  /* An A2A task the seller has taken on and not finished: its own word for accepted. */
  const task = readA2AReply(payload);
  if (task.kind === 'task' && (task.state === 'working' || task.state === 'submitted')) {
    return { status: 'accepted', reason: task.statusText, deliverableUrl: null };
  }
  return {
    status: 'unreachable',
    reason: 'The seller answered, but not in a form Pokter reads as accepted or refused. Pokter watches the chain for its delivery.',
    deliverableUrl: null,
  };
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
    reason:
      error instanceof Error && /timeout|aborted/i.test(`${error.name} ${error.message}`)
        ? 'The seller did not answer within 50 seconds. Some sellers do the work before answering, so it may still deliver.'
        : error instanceof Error ? error.message.slice(0, 300) : 'The seller could not be reached.',
    deliverableUrl: null,
  }));
  const store = getJobStore();
  const before = store.noticeFor(input.escrowChainId, input.jobId);
  const { deliverableUrl, ...recorded } = answer;
  const notice = store.recordNotice({ chainId: input.escrowChainId, jobId: input.jobId, ...recorded });

  /*
   * Kept the moment the seller says it, because the chain copy stops being
   * readable within about two hours: no free BNB Chain endpoint serves
   * eth_getLogs deeper than that, so a receipt verified later could not
   * find its own deliverable. Never overwritten — a seller re-asked about
   * a settled job must not be able to repoint a URL already delivered.
   */
  if (deliverableUrl) {
    const job = store.byId(`${input.escrowChainId}:${input.jobId}`);
    if (job && !job.deliverableUrl) store.record({ ...job, deliverableUrl });
  }

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
