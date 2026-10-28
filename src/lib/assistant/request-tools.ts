import { REQUEST_CATEGORIES, LIMITS } from '@/lib/briefs/model';
import { DELIVERY_OPTIONS } from '@/lib/briefs/public-view';

import type { AssistantToolSpec } from './tools';

/**
 * The other side of the marketplace as tools: finding paid work for an
 * agent, not an agent for a task.
 *
 * An assistant asked "find work for my agent" could only point at the
 * website. These let it read the requests buyers have posted, judge them
 * against the agent, and get a proposal ready — and stop there:
 *
 *   find requests → read one in full → prepare a proposal →
 *   the agent's owner reviews and signs it on the request page →
 *   the poster chooses → the poster hires through escrow
 *
 * Nothing here writes. A proposal is a signed commitment of the owner's
 * business, so it is sent only by the owner's own wallet, from the page;
 * prepare_proposal checks it and hands over the link, and every
 * description below says so.
 */

const requestId = { type: 'string', pattern: '^[0-9a-fA-F-]{8,64}$', description: 'The request’s id, as search_requests returns it (also the last part of its page URL).' } as const;

export const SEARCH_REQUESTS: AssistantToolSpec = {
  name: 'search_requests',
  title: 'Find requests to propose on',
  description:
    'Find work for an AI agent on Pokter: the requests buyers have posted on BNB Chain, each with a task, a budget in one token, a delivery time and the criteria a delivery is accepted by. Use it when the user wants paid jobs, buyers or leads for an agent they run. ' +
    'Pass for_agent to see only open requests in the category that agent is listed under, excluding its owner’s own; or search by words, category and network. Open requests only unless include_closed is set. Read-only.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', maxLength: 200, description: 'Words to look for in the title, brief and acceptance criteria.' },
      category: { type: 'string', enum: REQUEST_CATEGORIES.map((c) => c.id) },
      chain_id: { type: 'integer', enum: [56, 97], description: 'The network the request is funded on: 56 for BNB Chain (real money), 97 for BNB Testnet (test tokens).' },
      for_agent: {
        type: 'object',
        required: ['chain_id', 'token_id'],
        properties: { chain_id: { type: 'integer', enum: [56, 97] }, token_id: { type: 'string', pattern: '^\\d{1,12}$' } },
        description: 'The agent looking for work, by its ERC-8004 identity: returns the open requests in its category.',
      },
      include_closed: { type: 'boolean', description: 'Also return requests no longer taking proposals.' },
      limit: { type: 'integer', minimum: 1, maximum: 20, default: 8 },
    },
  },
  spends: false,
};

export const GET_REQUEST: AssistantToolSpec = {
  name: 'get_request',
  title: 'Read a request in full',
  description:
    'One request in full before proposing on it: the brief, every acceptance criterion and fail signal, the budget in its token (named by contract and chain), the delivery time, when proposals close, its status, and the proposals already made with their prices and notes. Read-only.',
  inputSchema: { type: 'object', required: ['request_id'], properties: { request_id: requestId } },
  spends: false,
};

export const PREPARE_PROPOSAL: AssistantToolSpec = {
  name: 'prepare_proposal',
  title: 'Prepare a proposal for the owner to sign',
  description:
    'Check a proposal for a request and get it ready for the agent’s owner to sign. Pokter reads the request and the ERC-8004 registry: the price must be in the request’s token and at or under its budget, and only the wallet the registry names as the agent’s owner can sign it. ' +
    'Returns what is wrong if anything is, the owner wallet that must sign, the exact text it will sign, anything that would stop a chosen proposal from being hired (an agent that cannot be quoted), and a link that opens the proposal on the request’s page, filled in. ' +
    'Nothing is sent or stored: the owner opens the link, checks every field and signs in their own wallet. Never say a proposal was made until they have.',
  inputSchema: {
    type: 'object',
    required: ['request_id', 'agent_chain_id', 'agent_token_id', 'price', 'deliver_days', 'note'],
    properties: {
      request_id: requestId,
      agent_chain_id: { type: 'integer', enum: [56, 97], description: 'The registry chain of the agent being offered.' },
      agent_token_id: { type: 'string', pattern: '^\\d{1,12}$', description: 'The agent’s ERC-8004 token id.' },
      price: { type: 'number', exclusiveMinimum: 0, description: 'What the agent will do it for, in whole units of the request’s token (0.5 means 0.5 USDT on a USDT request). At or under the budget. Ask the owner; never assume the budget.' },
      deliver_days: { type: 'integer', enum: [...DELIVERY_OPTIONS], description: 'Days from the hire to delivery.' },
      note: { type: 'string', minLength: 1, maxLength: LIMITS.note, description: 'How the agent will do the work, and anything in the brief the owner disputes. Buyers compare proposals on this.' },
      owner_address: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$', description: 'Optional: the public address of the wallet the owner will sign with, to check it is the registry’s owner. Never a private key or seed phrase.' },
    },
  },
  spends: false,
};

export const REQUEST_TOOLS: readonly AssistantToolSpec[] = [SEARCH_REQUESTS, GET_REQUEST, PREPARE_PROPOSAL];

/** Who does each step of winning a request, for integration_kit and the guides. */
export const PROPOSAL_TOOL_CHAIN = [
  { step: 'find requests', tool: 'search_requests', byWhom: 'assistant' },
  { step: 'read one in full', tool: 'get_request', byWhom: 'assistant' },
  { step: 'prepare the proposal', tool: 'prepare_proposal', byWhom: 'assistant' },
  { step: 'review and sign the proposal', tool: null, byWhom: 'the agent’s owner, in the wallet the registry names, on the request’s page' },
  { step: 'choose a proposal', tool: null, byWhom: 'the poster, with a signature' },
  { step: 'hire the agent through escrow', tool: null, byWhom: 'the poster, in their own wallet, against a quote the agent signs' },
] as const;
