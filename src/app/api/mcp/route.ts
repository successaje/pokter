import { NextResponse } from 'next/server';

import { GET as agentDetail } from '@/app/api/v1/agents/[chainId]/[tokenId]/route';
import { GET as listAgents } from '@/app/api/v1/agents/route';
import { POST as trial } from '@/app/api/trial/route';
import { CATEGORIES } from '@/lib/agents/categories';
import { integrationKit } from '@/lib/integration/live';
import { answerMcp, type McpTool } from '@/lib/mcp/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id, mcp-method', 'access-control-allow-methods': 'POST, OPTIONS' };

/*
 * Each tool calls the public API route that already answers the question,
 * with the caller's own headers, so an assistant gets exactly what the API
 * and the site say, under the same per-client rate limits. Nothing here
 * has a path to money: get_quote is the free trial's signed-price request,
 * and hire_link only builds a link the user opens and funds themselves.
 */
function tools(request: Request): McpTool[] {
  const origin = new URL(request.url).origin;
  // Only the headers the rate limit and logs read: the inner requests carry their own bodies.
  const passed = Object.fromEntries(['fly-client-ip', 'x-forwarded-for', 'user-agent'].flatMap((h) => (request.headers.get(h) ? [[h, request.headers.get(h) as string]] : [])));
  const forward = (url: string, init: RequestInit = {}) => new Request(url, { ...init, headers: { ...passed, ...(init.headers as Record<string, string> | undefined) } });
  const chain = (value: unknown) => (value === 56 || value === 97 || value === '56' || value === '97' ? Number(value) : null);
  const token = (value: unknown) => (typeof value === 'string' || typeof value === 'number') && /^\d{1,12}$/.test(String(value)) ? String(value) : null;
  const read = async (response: Response) => ({ data: await response.json().catch(() => ({ error: `HTTP ${response.status}` })), isError: !response.ok });
  const agentArgs = { chain_id: { type: 'integer', enum: [56, 97], description: 'The ERC-8004 registry chain: 56 for BNB Chain, 97 for BNB Testnet.' }, token_id: { type: 'string', pattern: '^\\d{1,12}$', description: 'The agent’s ERC-8004 token id.' } };

  return [
    {
      name: 'search_agents',
      title: 'Search agents',
      description: 'Find BNB Chain agents for a task. Plain words search names and descriptions; qualifiers filter exactly (is:hireable, is:reliable, has:price, has:probes>10). Returns each agent’s evidence summary, signed price and whether it can be hired now.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', maxLength: 200, description: 'What the agent should do, e.g. "watch my Venus loan", or qualifiers.' },
          category: { type: 'string', enum: CATEGORIES.map((c) => c.id) },
          hireable_only: { type: 'boolean', description: 'Only agents that can be hired through Pokter right now.' },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 8 },
        },
      },
      async run(args) {
        const url = new URL('/api/v1/agents', origin);
        const q = [typeof args.query === 'string' ? args.query.slice(0, 200) : '', args.hireable_only ? 'is:hireable' : ''].filter(Boolean).join(' ');
        if (q) url.searchParams.set('q', q);
        if (typeof args.category === 'string') url.searchParams.set('category', args.category);
        url.searchParams.set('limit', String(Math.min(Math.max(Number(args.limit) || 8, 1), 20)));
        return read(await listAgents(forward(url.href)));
      },
    },
    {
      name: 'get_agent',
      title: 'Get an agent’s evidence',
      description: 'One agent’s full record: availability measured by Pokter, decoded attestations, its signed price, paid deliveries, the evidence ladder, and hireBlocker (why it cannot be priced or hired right now, if anything).',
      inputSchema: { type: 'object', required: ['chain_id', 'token_id'], properties: agentArgs },
      async run(args) {
        const c = chain(args.chain_id);
        const t = token(args.token_id);
        if (!c || !t) return { data: { error: 'chain_id must be 56 or 97 and token_id a number.' }, isError: true };
        return read(await agentDetail(forward(new URL(`/api/v1/agents/${c}/${t}`, origin).href), { params: Promise.resolve({ chainId: String(c), tokenId: t }) }));
      },
    },
    {
      name: 'get_quote',
      title: 'Ask an agent for a signed price',
      description: 'Ask the agent what it would charge for this exact brief. It must answer with a price signed by its registered wallet, which Pokter verifies. Free: no wallet, no payment, nothing is executed. Use the agent’s own example format when it declares one (see get_agent).',
      inputSchema: { type: 'object', required: ['chain_id', 'token_id', 'task'], properties: { ...agentArgs, task: { type: 'string', minLength: 1, maxLength: 500, description: 'The brief, exactly as the user would hire it.' } } },
      async run(args) {
        const c = chain(args.chain_id);
        const t = token(args.token_id);
        if (!c || !t || typeof args.task !== 'string') return { data: { error: 'chain_id, token_id and task are required.' }, isError: true };
        return read(await trial(forward(new URL('/api/trial', origin).href, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId: c, tokenId: t, task: args.task }) })));
      },
    },
    {
      name: 'hire_link',
      title: 'Link to hire an agent',
      description: 'A link where the user hires the agent with this brief. They review the terms, the signed price and any warnings, then fund escrow in their own wallet; the agent is paid only when it delivers. Give the user the link; you cannot hire on their behalf.',
      inputSchema: { type: 'object', required: ['chain_id', 'token_id'], properties: { ...agentArgs, task: { type: 'string', maxLength: 2000, description: 'The brief to pre-fill; the user can still edit it.' } } },
      async run(args) {
        const c = chain(args.chain_id);
        const t = token(args.token_id);
        if (!c || !t) return { data: { error: 'chain_id must be 56 or 97 and token_id a number.' }, isError: true };
        const url = new URL(`/hire/${c}/${t}`, origin);
        if (typeof args.task === 'string' && args.task.trim()) url.searchParams.set('task', args.task.trim().slice(0, 2000));
        return {
          data: {
            url: url.href,
            next: 'The user opens the link, reviews the brief, price and warnings, and funds escrow from their own wallet. Nothing is paid until they sign; the agent is paid only after it delivers.',
          },
        };
      },
    },
    {
      name: 'integration_kit',
      title: 'What an agent needs to be hired',
      description: 'For builders: what an agent must declare, sign and deliver to be measured, quoted, hired and paid through Pokter, every refusal code, and the escrow contracts.',
      inputSchema: { type: 'object', properties: {} },
      async run() {
        return { data: integrationKit(origin) };
      },
    },
  ];
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => undefined);
  if (body === undefined) {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: the body is not JSON.' } }, { status: 400, headers: CORS });
  }
  const answer = await answerMcp(body, tools(request));
  // Only notifications: accepted, nothing to say.
  if (answer === null) return new Response(null, { status: 202, headers: CORS });
  return NextResponse.json(answer, { headers: CORS });
}

/** No server-initiated stream: every answer comes back on its POST. */
export function GET(): Response {
  return new Response('Pokter’s MCP server speaks Streamable HTTP over POST. See https://pokter.xyz/developers#mcp', { status: 405, headers: { allow: 'POST, OPTIONS', ...CORS } });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
