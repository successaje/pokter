import 'server-only';

import { getAddress } from 'viem';

import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { quoteChainFor } from '@/lib/evidence/refs';

import { deliverHouseJob } from './deliver';
import { houseAccount } from './keys';
import { signHouseQuote } from './quote';
import { HOUSE_CHAINS, type HouseAgentDefinition, type HouseChainId } from './types';

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function houseChain(value: unknown): HouseChainId | null {
  const n = Number(value);
  return (HOUSE_CHAINS as readonly number[]).includes(n) ? (n as HouseChainId) : null;
}

export interface RpcReply {
  status: number;
  body: Record<string, unknown>;
}

function message(id: unknown, data: unknown): RpcReply {
  return {
    status: 200,
    body: { jsonrpc: '2.0', id, result: { kind: 'message', role: 'agent', messageId: crypto.randomUUID(), parts: [{ kind: 'data', data }] } },
  };
}

function rpcError(id: unknown, code: number, text: string, status = 400): RpcReply {
  return { status, body: { jsonrpc: '2.0', id, error: { code, message: text } } };
}

/**
 * One JSON-RPC `message/send` for a house agent.
 *
 * `negotiate` checks the brief before signing anything, so a buyer is told
 * what the agent needs while the money is still theirs. `notify_funded`
 * answers in the reference shape (`status: accepted | rejected`, with a
 * reason) that Pokter and the reference sellers read. The work skill
 * called directly is a free preview: whether the brief can be answered,
 * never the paid result.
 */
export async function handleHouseRpc(definition: HouseAgentDefinition, body: Record<string, unknown>, endpointChain: string | null): Promise<RpcReply> {
  const id = body.id ?? null;
  if (body.jsonrpc !== '2.0' || body.method !== 'message/send') return rpcError(id, -32601, 'Only message/send is supported.');
  const parts = (() => {
    const params = object(body.params);
    const msg = object(params?.message);
    return Array.isArray(msg?.parts) ? msg.parts : [];
  })();
  const data = parts.map((part) => object(object(part)?.data)).find(Boolean) ?? {};
  const text = parts.map((part) => object(part)).find((part) => part?.kind === 'text')?.text;
  const skill = String(data.skill ?? definition.skill.id);
  const brief = String(data.task_description ?? data.task ?? data.brief ?? text ?? '').trim();

  if (skill === 'negotiate' || skill === 'quote') {
    if (!brief) return message(id, { accepted: false, reason: 'Send the brief as task_description.', examples: definition.skill.examples });
    const problem = definition.check(brief);
    if (problem) return message(id, { accepted: false, reason: problem.error, need: problem.need, examples: definition.skill.examples });
    const chainId = quoteChainFor({ chainId: data.chain_id ?? data.chainId, escrowChains: data.escrow_chains, endpointChain }) as HouseChainId;
    const addresses = correctedErc8183Addresses(chainId);
    const terms = object(data.terms);
    try {
      const quote = await signHouseQuote({
        definition,
        account: houseAccount(definition),
        chainId,
        paymentToken: getAddress(addresses.paymentToken),
        verifyingContract: addresses.commerce,
        task: brief,
        deliverables: typeof terms?.deliverables === 'string' ? terms.deliverables : undefined,
        qualityStandards: typeof terms?.quality_standards === 'string' ? terms.quality_standards : undefined,
      });
      return message(id, quote);
    } catch (error) {
      return rpcError(id, -32603, `Cannot sign a quote right now: ${(error as Error).message}`, 503);
    }
  }

  if (skill === 'notify_funded') {
    const jobId = String(data.job_id ?? data.jobId ?? '');
    const chainId = houseChain(data.chain_id ?? data.chainId) ?? houseChain(endpointChain);
    if (chainId === null) {
      return message(id, { status: 'rejected', accepted: false, job_id: jobId, reason: 'Name the escrow chain the job was funded on (56 or 97). A delivery is a transaction and is not sent on a guess.' });
    }
    try {
      const outcome = await deliverHouseJob(definition, chainId, jobId);
      if (outcome.status === 'refused') return message(id, { status: 'rejected', accepted: false, job_id: jobId, reason: outcome.reason });
      return message(id, {
        status: 'accepted',
        accepted: true,
        job_id: jobId,
        deliverable_url: outcome.deliverableUrl,
        transaction_hash: outcome.status === 'delivered' ? outcome.transactionHash : null,
        already_delivered: outcome.status === 'already-delivered',
      });
    } catch (error) {
      return rpcError(id, -32603, `Delivery did not complete: ${(error as Error).message}`, 503);
    }
  }

  if (skill !== definition.skill.id) return rpcError(id, -32601, `Unknown skill "${skill}". This agent offers negotiate, notify_funded and ${definition.skill.id}.`);
  if (!brief) return message(id, { can_answer: false, reason: 'Send a brief.', examples: definition.skill.examples });
  const problem = definition.check(brief);
  return message(id, {
    preview: true,
    can_answer: problem === null,
    ...(problem ? { reason: problem.error, need: problem.need } : {}),
    price_u: definition.priceU,
    returns: definition.deliverables,
    examples: definition.skill.examples,
    note: 'A preview checks the brief. The answer itself is delivered through a funded ERC-8183 job: negotiate, fund, then notify_funded.',
  });
}
