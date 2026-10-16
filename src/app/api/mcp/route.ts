import { NextResponse } from 'next/server';

import { GET as agentDetail } from '@/app/api/v1/agents/[chainId]/[tokenId]/route';
import { POST as trial } from '@/app/api/trial/route';
import { CATEGORIES } from '@/lib/agents/categories';
import { integrationKit } from '@/lib/integration/live';
import { AGENT_CARD_HTML } from '@/lib/mcp/agent-card-html';
import { AGENT_CARD_URI, buildAgentCard, MCP_APP_MIME } from '@/lib/mcp/agent-card';
import { answerMcp, type McpResource, type McpTool } from '@/lib/mcp/server';
import { discover } from '@/features/discover/search';
import { parseDiscoverParams } from '@/features/discover/params';
import { apiRateLimit, originOf } from '@/lib/api/respond';

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
  // The public origin for links a user opens; the socket's (0.0.0.0:8080 behind the proxy) only for in-process calls.
  const origin = originOf(request);
  const local = new URL(request.url).origin;
  // Only the headers the rate limit and logs read: the inner requests carry their own bodies.
  const passed: Record<string, string> = Object.fromEntries(['fly-client-ip', 'x-forwarded-for', 'user-agent'].flatMap((h) => (request.headers.get(h) ? [[h, request.headers.get(h) as string]] : [])));
  /*
   * And the public host: the routes build their links with originOf, which
   * reads the proxy's forwarded headers. Without them get_agent's links
   * came out as https://0.0.0.0:8080/…, the machine's own address.
   */
  const publicUrl = new URL(origin);
  passed['x-forwarded-host'] = publicUrl.host;
  passed['x-forwarded-proto'] = publicUrl.protocol.replace(':', '');
  const forward = (url: string, init: RequestInit = {}) => new Request(url, { ...init, headers: { ...passed, ...(init.headers as Record<string, string> | undefined) } });
  const chain = (value: unknown) => (value === 56 || value === 97 || value === '56' || value === '97' ? Number(value) : null);
  const token = (value: unknown) => (typeof value === 'string' || typeof value === 'number') && /^\d{1,12}$/.test(String(value)) ? String(value) : null;
  const read = async (response: Response) => ({ data: await response.json().catch(() => ({ error: `HTTP ${response.status}` })), isError: !response.ok });
  // The agent's public record, for the card the three agent tools carry.
  const detail = async (c: number, t: string) => {
    const response = await agentDetail(forward(new URL(`/api/v1/agents/${c}/${t}`, local).href), { params: Promise.resolve({ chainId: String(c), tokenId: t }) });
    return response.ok ? ((await response.json()) as Record<string, unknown>) : null;
  };
  const agentArgs = { chain_id: { type: 'integer', enum: [56, 97], description: 'The ERC-8004 registry chain: 56 for BNB Chain, 97 for BNB Testnet.' }, token_id: { type: 'string', pattern: '^\\d{1,12}$', description: 'The agent’s ERC-8004 token id.' } };

  return [
    {
      name: 'search_agents',
      title: 'Search agents',
      description:
        'Search the Pokter agent marketplace for AI agents to hire on BNB Chain (ERC-8004 agents paid through ERC-8183 escrow). Use this when the user wants to find, compare or hire an agent for a crypto or DeFi task: token safety and honeypot checks, lending health factor and liquidation risk, yield, grid trading, portfolio or LP rebalancing. Describe the task in plain words; it is read for intent. ' +
        'Qualifiers filter exactly (is:hireable, is:reliable, has:price). Returns each agent with its measured evidence, its signed price and whether it can be hired now.',
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
        /*
         * Discover's search, not the API's literal one: it reads a request
         * for intent, so "token safety" finds the token-safety agents even
         * where no description says "safety". An assistant phrases things
         * the way people do.
         */
        const params = parseDiscoverParams({
          q: typeof args.query === 'string' ? args.query.slice(0, 200) : '',
          category: typeof args.category === 'string' ? args.category : undefined,
          hireable: args.hireable_only ? '1' : undefined,
        });
        const found = await discover(params);
        const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 20);
        return {
          data: {
            total: found.total,
            reading: found.reading ? { category: found.reading.categoryLabel, terms: found.reading.terms, byName: found.reading.byName } : null,
            agents: found.rows.slice(0, limit).map((row) => ({
              chainId: row.chainId,
              tokenId: row.tokenId,
              name: row.name,
              category: row.categoryLabel,
              description: row.description,
              verdict: row.verdict,
              answeredToday: row.answeringToday,
              price: row.priceU !== null ? `${row.priceU} $U, signed by the agent` : null,
              hiredOn: row.hireChainId,
              why: row.reason,
              page: `${origin}/agents/${row.chainId}/${row.tokenId}`,
            })),
            ...(found.total === 0 && found.suggestions ? { suggestions: [...found.suggestions.close, ...found.suggestions.active].slice(0, 5).map((row) => ({ chainId: row.chainId, tokenId: row.tokenId, name: row.name })) } : {}),
          },
        };
      },
    },
    {
      name: 'get_agent',
      ui: AGENT_CARD_URI,
      title: 'Get an agent’s evidence',
      description:
        'Look up one agent on the Pokter marketplace before hiring it: whether it answered Pokter’s checks, its signed price, paid deliveries and receipts, the evidence ladder, and hireBlocker (why it cannot be priced or hired right now, with the fix). Use it to vet or compare agents, or to explain why an agent cannot be hired.',
      inputSchema: { type: 'object', required: ['chain_id', 'token_id'], properties: agentArgs },
      async run(args) {
        const c = chain(args.chain_id);
        const t = token(args.token_id);
        if (!c || !t) return { data: { error: 'chain_id must be 56 or 97 and token_id a number.' }, isError: true };
        const record = await detail(c, t);
        if (!record) return { data: { error: 'No such agent, or the registry did not answer.' }, isError: true };
        return { data: { ...record, card: buildAgentCard(record, { origin }) } };
      },
    },
    {
      name: 'get_quote',
      ui: AGENT_CARD_URI,
      title: 'Ask an agent for a signed price',
      description:
        'Get a price quote from an agent for a specific job before hiring it: the agent answers with a price signed by its registered wallet, which Pokter verifies against the exact brief. To get it, Pokter sends the brief to the agent’s own endpoint, run by its builder; only agents with an A2A endpoint can quote. Free: no wallet, no payment, nothing executed. A fresh quote each call. Use the agent’s own example format when it declares one (see get_agent).',
      inputSchema: { type: 'object', required: ['chain_id', 'token_id', 'task'], properties: { ...agentArgs, task: { type: 'string', minLength: 1, maxLength: 500, description: 'The brief, exactly as the user would hire it: at least 10 characters, unless it is one of the agent’s published examples.' } } },
      async run(args) {
        const c = chain(args.chain_id);
        const t = token(args.token_id);
        if (!c || !t || typeof args.task !== 'string') return { data: { error: 'chain_id, token_id and task are required.' }, isError: true };
        const answered = await read(await trial(forward(new URL('/api/trial', local).href, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId: c, tokenId: t, task: args.task }) })));
        if (answered.isError) return answered;
        const quoted = answered.data as { receipt?: { response?: { terms?: { price?: string } } }; verifiedSigner?: string; termsBound?: boolean };
        const record = await detail(c, t);
        const card = record
          ? buildAgentCard(record, { origin, brief: args.task, quote: quoted.receipt?.response?.terms?.price && quoted.verifiedSigner ? { priceRaw: quoted.receipt.response.terms.price, signer: quoted.verifiedSigner, termsBound: Boolean(quoted.termsBound) } : null })
          : null;
        return { data: { ...(answered.data as object), ...(card ? { card } : {}) } };
      },
    },
    {
      name: 'hire_link',
      ui: AGENT_CARD_URI,
      title: 'Link to hire an agent',
      description:
        'Get the link to hire an agent on BNB Chain with this brief. The user opens it, reviews the terms, the signed price and any warnings, and funds escrow in their own wallet; the agent is paid only after it delivers and the review window passes without a dispute. Use it whenever the user asks to hire, buy or commission an agent’s work. You cannot hire on their behalf.',
      inputSchema: { type: 'object', required: ['chain_id', 'token_id'], properties: { ...agentArgs, task: { type: 'string', maxLength: 2000, description: 'The brief to pre-fill; the user can still edit it.' } } },
      async run(args) {
        const c = chain(args.chain_id);
        const t = token(args.token_id);
        if (!c || !t) return { data: { error: 'chain_id must be 56 or 97 and token_id a number.' }, isError: true };
        const url = new URL(`/hire/${c}/${t}`, origin);
        if (typeof args.task === 'string' && args.task.trim()) url.searchParams.set('task', args.task.trim().slice(0, 2000));
        const record = await detail(c, t);
        return {
          data: {
            ...(record ? { card: buildAgentCard(record, { origin, brief: typeof args.task === 'string' && args.task.trim() ? args.task.trim() : null }) } : {}),
            url: url.href,
            next: 'The user opens the link, reviews the brief, price and warnings, and funds escrow from their own wallet. Nothing is paid until they sign; the agent is paid only after it delivers and the review window passes without a dispute.',
          },
        };
      },
    },
    {
      name: 'integration_kit',
      title: 'What an agent needs to be hired',
      description:
        'For builders: what an AI agent must declare, sign and deliver to be listed, quoted, hired and paid through Pokter on BNB Chain (ERC-8004 identity, A2A or MCP, ERC-8183 escrow), every refusal code, and the escrow contracts. Use it when the user is building an agent, for example for BNB Chain Set and Earn.',
      inputSchema: { type: 'object', properties: {} },
      async run() {
        return { data: integrationKit(origin) };
      },
    },
  ];
}

export async function POST(request: Request): Promise<Response> {
  // Per client, like the public API: each call may search the catalogue or reach an agent.
  const limited = apiRateLimit(request, 'mcp', 60);
  if (limited) return limited;
  const body = await request.json().catch(() => undefined);
  if (body === undefined) {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: the body is not JSON.' } }, { status: 400, headers: CORS });
  }
  const answer = await answerMcp(body, tools(request), RESOURCES);
  // Only notifications: accepted, nothing to say.
  if (answer === null) return new Response(null, { status: 202, headers: CORS });
  return NextResponse.json(answer, { headers: CORS });
}

/** The MCP Apps views this server offers: the agent card. */
const RESOURCES: McpResource[] = [
  {
    uri: AGENT_CARD_URI,
    name: 'Agent card',
    description: 'An agent’s evidence step, signed price, network and any hire blocker, with a button to hire it on Pokter.',
    mimeType: MCP_APP_MIME,
    text: AGENT_CARD_HTML,
    // Self-contained: no network, no external images, so the default sandbox suffices.
    meta: { ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } } },
  },
];

/** No server-initiated stream: every answer comes back on its POST. */
export function GET(): Response {
  return new Response('Pokter’s MCP server speaks Streamable HTTP over POST. See https://pokter.xyz/developers#mcp', { status: 405, headers: { allow: 'POST, OPTIONS', ...CORS } });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
