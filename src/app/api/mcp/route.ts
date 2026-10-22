import { NextResponse } from 'next/server';

import { GET as agentDetail } from '@/app/api/v1/agents/[chainId]/[tokenId]/route';
import { POST as trial } from '@/app/api/trial/route';
import { POST as compileBrief } from '@/app/api/hire/compile/route';
import { POST as prepareHire } from '@/app/api/hire/prepare/route';
import { GET as jobDetail } from '@/app/api/jobs/[jobId]/route';
import { GET as jobReportCheck } from '@/app/api/jobs/[jobId]/report-check/route';
import { CHECK_DELIVERY, HIRE_TOOL_CHAIN, JOB_STATUS, PREPARE_BRIEF, PREPARE_HIRE } from '@/lib/assistant/tools';
import { CATEGORIES } from '@/lib/agents/categories';
import { integrationKit } from '@/lib/integration/live';
import { AGENT_CARD_HTML } from '@/lib/mcp/agent-card-html';
import { AGENT_CARD_URI, buildAgentCard, MCP_APP_MIME, networkOf } from '@/lib/mcp/agent-card';
import { formatQuoted } from '@/lib/network/tokens';
import { agentIdentityKey } from '@/lib/agents/distinct';
import { escrowChainForHire } from '@/lib/network/escrow';
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
  /* A job id is the escrow's own counter, which the job routes accept up to
     eighteen digits — a wider field than a registry token id. */
  const jobNumber = (value: unknown) => (typeof value === 'string' || typeof value === 'number') && /^\d{1,18}$/.test(String(value)) ? String(value) : null;
  const read = async (response: Response) => ({ data: await response.json().catch(() => ({ error: `HTTP ${response.status}` })), isError: !response.ok });
  // The agent's public record, for the card the three agent tools carry.
  const detail = async (c: number, t: string) => {
    const response = await agentDetail(forward(new URL(`/api/v1/agents/${c}/${t}`, local).href), { params: Promise.resolve({ chainId: String(c), tokenId: t }) });
    return response.ok ? ((await response.json()) as Record<string, unknown>) : null;
  };
  const agentArgs = { chain_id: { type: 'integer', enum: [56, 97], description: 'The ERC-8004 registry chain: 56 for BNB Chain, 97 for BNB Testnet.' }, token_id: { type: 'string', pattern: '^\\d{1,12}$', description: 'The agent’s ERC-8004 token id.' } };
  /*
   * The same agent's registrations on the other network. Builders register
   * one agent on both, and the evidence differs between them: the house
   * agents passed their correctness checks on testnet, so an assistant
   * reading only the mainnet record told users no check had passed.
   */
  const twins = async (record: Record<string, unknown>) => {
    const name = typeof record.name === 'string' ? record.name : '';
    const owner = typeof record.owner === 'string' ? record.owner : '';
    if (!name || !owner) return [];
    const self = `${record.chainId}:${record.tokenId}`;
    const key = agentIdentityKey({ owner_address: owner, name, chain_id: Number(record.chainId), token_id: String(record.tokenId) });
    const other = Number(record.chainId) === 56 ? '97' : '56';
    const found = await discover(parseDiscoverParams({ q: name, chain: other })).catch(() => null);
    return (found?.rows ?? [])
      .filter((row) => `${row.chainId}:${row.tokenId}` !== self && agentIdentityKey({ owner_address: row.owner, name: row.name, chain_id: row.chainId, token_id: row.tokenId }) === key)
      .map((row) => ({ chainId: row.chainId, tokenId: row.tokenId, evidence: row.maturity.label, page: `${origin}/agents/${row.chainId}/${row.tokenId}` }));
  };
  /*
   * What the user will be asked to agree to on the hire page, said beside
   * the link so an assistant can state it before the user opens it.
   */
  const hireTerms = (record: Record<string, unknown>) => {
    const price = record.price as { amountU?: number; current?: boolean; expiresAt?: string } | null | undefined;
    const hire = record.hire as { escrowChainId?: number | null } | null | undefined;
    const blocker = record.hireBlocker as { reason?: string } | null | undefined;
    const network = networkOf(hire?.escrowChainId ?? null);
    return {
      network: network?.label ?? null,
      money: network?.money ?? null,
      price: typeof price?.amountU === 'number' ? `${price.amountU} $U` : null,
      priceCurrent: typeof price?.amountU === 'number' ? Boolean(price.current) : null,
      ...(typeof price?.amountU === 'number' && !price.current ? { priceNote: 'The stored price has expired. The hire page asks the agent for a fresh one before anything is funded; get_quote shows it now.' } : {}),
      ...(typeof price?.amountU !== 'number' ? { priceNote: 'No signed price: the user sets the budget on the hire page, and the agent may decline.' } : {}),
      blocker: blocker?.reason ?? null,
    };
  };
  /** A signed price in words: amount, money, network and how long it holds. */
  const termsOf = (priceRaw: string, currency: string | undefined, expiresAt: string | undefined) => {
    /*
     * The escrow chain comes from the currency, and that inference is sound
     * because it matches on **address**, not symbol: each token has a
     * different contract on each chain, so $U on 56 and $U on 97 are already
     * distinct keys, as are USDT's two deployments. It would break only if
     * one address were a payment token on two chains, which no deployment
     * does. Symbol-based inference would break immediately, which is why the
     * registry is keyed by the pair and never by the symbol.
     */
    const escrowChain = escrowChainForHire(currency);
    const network = networkOf(escrowChain);
    const until = expiresAt ? Date.parse(expiresAt) : Number.NaN;
    return {
      /*
       * The currency this function has always been given and never used,
       * read on the chain it belongs to whether or not that escrow is
       * enabled: the label is about the money, `network` about where a hire
       * can settle. `formatQuoted` returns null when the token is not one Pokter has
       * verified, and the price then says the raw amount and names no money,
       * because naming the wrong money is the worse failure.
       */
      price: formatQuoted(currency, priceRaw)?.label ?? `${priceRaw} raw units (no verified token for ${currency ?? 'an unstated currency'})`,
      network: network?.label ?? 'No escrow Pokter enables settles this token',
      money: network?.money ?? null,
      validUntil: Number.isFinite(until) ? new Date(until).toISOString() : null,
      validForMinutes: Number.isFinite(until) ? Math.max(0, Math.round((until - Date.now()) / 60_000)) : null,
    };
  };

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
              evidence: row.maturity.label,
              answeredToday: row.answeringToday,
              price: row.priceU !== null ? `${row.priceU} $U, signed by the agent` : null,
              // A signed price holds for minutes; an expired one is a guide, and get_quote asks for a current one.
              priceCurrent: row.priceU !== null ? row.priceFresh : null,
              ...(row.priceU === null
                ? { noPrice: row.hirable ? 'It has not signed a price: on the hire page the buyer sets the budget, and the agent may decline.' : 'It has not signed a price and cannot be hired now; get_agent says why.' }
                : {}),
              hireable: row.hirable,
              hiredOn: row.hireChainId,
              network: networkOf(row.hireChainId),
              ...(row.alsoOn.length ? { alsoRegisteredOn: row.alsoOn, alsoRegisteredNote: 'Evidence is kept per registration; get_agent lists each one and what it has earned.' } : {}),
              why: row.reason,
              page: `${origin}/agents/${row.chainId}/${row.tokenId}`,
            })),
            ...(found.total === 0 && found.suggestions ? { suggestions: found.suggestions.close.slice(0, 5).map((row) => ({ chainId: row.chainId, tokenId: row.tokenId, name: row.name })) } : {}),
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
        const otherRegistrations = await twins(record);
        return { data: { ...record, ...(otherRegistrations.length ? { otherRegistrations } : {}), card: buildAgentCard(record, { origin }) } };
      },
    },
    {
      name: 'get_quote',
      ui: AGENT_CARD_URI,
      title: 'Ask an agent for a signed price',
      description:
        'Get a price quote from an agent for a specific job before hiring it: the agent answers with a price signed by its registered wallet, which Pokter verifies against the exact brief. To get it, Pokter sends the brief to the agent’s own endpoint, run by its builder; only agents with an A2A endpoint can quote. Free: no wallet, no payment, nothing executed. A fresh quote each call, at most 5 a minute from one network address. Use the agent’s own example format when it declares one (see get_agent).',
      inputSchema: { type: 'object', required: ['chain_id', 'token_id', 'task'], properties: { ...agentArgs, task: { type: 'string', minLength: 1, maxLength: 500, description: 'The brief, exactly as the user would hire it: at least 10 characters, unless it is one of the agent’s published examples.' } } },
      async run(args) {
        const c = chain(args.chain_id);
        const t = token(args.token_id);
        if (!c || !t || typeof args.task !== 'string') return { data: { error: 'chain_id, token_id and task are required.' }, isError: true };
        const answered = await read(await trial(forward(new URL('/api/trial', local).href, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId: c, tokenId: t, task: args.task }) })));
        if (answered.isError) return answered;
        const quoted = answered.data as { receipt?: { response?: { terms?: { price?: string; currency?: string } }; quote_expires_at?: string }; verifiedSigner?: string; termsBound?: boolean };
        const priceRaw = quoted.receipt?.response?.terms?.price;
        // The raw receipt is wei and a token address; say it in words too, so an assistant does not convert it.
        const terms = priceRaw && /^\d+$/.test(priceRaw) ? { ...termsOf(priceRaw, quoted.receipt?.response?.terms?.currency, quoted.receipt?.quote_expires_at), signedByAgentWallet: Boolean(quoted.verifiedSigner), boundToThisBrief: Boolean(quoted.termsBound) } : null;
        const record = await detail(c, t);
        const card = record
          ? buildAgentCard(record, { origin, brief: args.task, quote: quoted.receipt?.response?.terms?.price && quoted.verifiedSigner ? { priceRaw: quoted.receipt.response.terms.price, currency: quoted.receipt?.response?.terms?.currency ?? null, signer: quoted.verifiedSigner, termsBound: Boolean(quoted.termsBound) } : null })
          : null;
        return { data: { ...(terms ? { terms } : {}), ...(answered.data as object), ...(card ? { card } : {}) } };
      },
    },
    {
      name: 'hire_link',
      ui: AGENT_CARD_URI,
      title: 'Link to hire an agent',
      description:
        'Get the link to hire an agent on BNB Chain with this brief. The user opens it, reviews the terms, the signed price and any warnings, and funds escrow in their own wallet; the agent is paid only after it delivers and the review window passes without a successful dispute. Use it whenever the user asks to hire, buy or commission an agent’s work. You cannot hire on their behalf.',
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
            ...(record ? { terms: hireTerms(record) } : {}),
            next: 'The user opens the link, reviews the brief, price and warnings, and funds escrow from their own wallet. Nothing is paid until they sign; the agent is paid only after it delivers and the review window passes without a successful dispute.',
          },
        };
      },
    },
    /*
     * The four that carry a hire past the link, each one the public route
     * that already answers it. The brief is compiled by the compiler the
     * hire page uses, the price is the one `/api/hire/quote` verified, and
     * the prepared hire is unsigned: the owner approves and funds it in
     * their own wallet, which is the one step with no tool behind it.
     */
    {
      ...PREPARE_BRIEF,
      async run(args) {
        const c = chain(args.chain_id);
        const t = token(args.token_id);
        if (!c || !t || typeof args.task !== 'string') return { data: { error: 'chain_id, token_id and task are required.' }, isError: true };
        const answers = args.answers && typeof args.answers === 'object' && !Array.isArray(args.answers) ? args.answers : undefined;
        return read(await compileBrief(forward(new URL('/api/hire/compile', local).href, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId: c, tokenId: t, task: args.task, answers }) })));
      },
    },
    {
      ...PREPARE_HIRE,
      /*
       * Not a read, and not destructive either: it records the request it
       * hands over, which is what makes a retry one job rather than two. It
       * still cannot spend — the owner's wallet is the only thing that can.
       */
      annotations: { readOnlyHint: false, idempotentHint: true },
      async run(args) {
        const c = chain(args.chain_id);
        const t = token(args.token_id);
        if (!c || !t || typeof args.task !== 'string') return { data: { error: 'chain_id, token_id and task are required.' }, isError: true };
        /*
         * Both of the owner's own inputs, refused here rather than
         * defaulted down to the route. The escrow chain decides whether
         * this hire spends real money, and an agent registered on one
         * network may quote in the other's token — so it is the owner's
         * choice and never the agent's.
         */
        const escrow = chain(args.escrow_chain_id);
        if (!escrow) {
          return { data: { error: 'escrow_chain_id is required: 56 to fund with real $U on BNB Chain, or 97 for test tokens on BNB Testnet. Ask the owner which; Pokter will not choose between real and test money for them.' }, isError: true };
        }
        if (typeof args.max_budget !== 'number') {
          return { data: { error: `max_budget is required and must be a number: the most the owner has authorised for this job, in whole $U on chain ${escrow}. Ask the owner; Pokter sets no budget of its own.` }, isError: true };
        }
        const answers = args.answers && typeof args.answers === 'object' && !Array.isArray(args.answers) ? args.answers : undefined;
        return read(
          await prepareHire(
            forward(new URL('/api/hire/prepare', local).href, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                chainId: c,
                tokenId: t,
                task: args.task,
                answers,
                escrowChainId: escrow,
                maxBudget: args.max_budget,
                ...(typeof args.request_id === 'string' ? { requestId: args.request_id } : {}),
                ...(typeof args.possibly_funded_job_id === 'string' ? { possiblyFundedJobId: args.possibly_funded_job_id } : {}),
                ...(typeof args.owner_address === 'string' ? { owner: args.owner_address } : {}),
              }),
            }),
          ),
        );
      },
    },
    {
      ...JOB_STATUS,
      async run(args) {
        const job = jobNumber(args.job_id);
        const escrow = chain(args.chain_id);
        /* The escrow chain is a term of the hire, not a guess: a job id
           exists on both deployments and means different things on each. */
        if (!job || !escrow) return { data: { error: 'job_id is the numeric ERC-8183 job id, and chain_id the escrow it was funded on (56 or 97).' }, isError: true };
        const url = new URL(`/api/jobs/${job}`, local);
        url.searchParams.set('chain', String(escrow));
        return read(await jobDetail(forward(url.href), { params: Promise.resolve({ jobId: job }) }));
      },
    },
    {
      ...CHECK_DELIVERY,
      async run(args) {
        const job = jobNumber(args.job_id);
        const escrow = chain(args.chain_id);
        if (!job || !escrow) return { data: { error: 'job_id is the numeric ERC-8183 job id, and chain_id the escrow it was funded on (56 or 97).' }, isError: true };
        const jobUrl = new URL(`/api/jobs/${job}`, local);
        const checkUrl = new URL(`/api/jobs/${job}/report-check`, local);
        for (const url of [jobUrl, checkUrl]) url.searchParams.set('chain', String(escrow));
        /*
         * The delivery and the check together, because either alone misleads:
         * a link with no check invites the assistant to grade the report
         * itself, and a check with no link gives the owner nothing to read.
         */
        const [state, check] = await Promise.all([
          read(await jobDetail(forward(jobUrl.href), { params: Promise.resolve({ jobId: job }) })),
          read(await jobReportCheck(forward(checkUrl.href), { params: Promise.resolve({ jobId: job }) })),
        ]);
        const record = (state.data as { job?: { status?: string; deliverableUrl?: string | null; task?: string } }).job ?? null;
        return {
          data: {
            job: record ? { status: record.status, deliverableUrl: record.deliverableUrl ?? null, task: record.task } : null,
            verification: check.data,
            settles: 'Nothing. This is advisory: it releases no escrow, pays nobody and raises no dispute. Only the owner can release or dispute, in their own wallet.',
          },
          /*
           * Either half failing is a failed call. This read only the job,
           * so a verification that came back 502 was handed to the
           * assistant as a successful answer with an error inside it —
           * which is how "Pokter could not check this" gets reported as
           * "Pokter checked this". A job the check does not apply to is a
           * different thing: that answers 200 and says so.
           */
          isError: state.isError || check.isError,
        };
      },
    },
    {
      name: 'integration_kit',
      title: 'What an agent needs to be hired',
      description:
        'For builders: what an AI agent must declare, sign and deliver to be listed, quoted, hired and paid through Pokter on BNB Chain (ERC-8004 identity; an A2A endpoint with a negotiate skill to be priced and hired, where MCP alone can only be measured; ERC-8183 escrow), every refusal code, and the escrow contracts. Use it when the user is building an agent, for example for BNB Chain Set and Earn.',
      inputSchema: { type: 'object', properties: {} },
      async run() {
        /*
         * And which steps a buyer's assistant can take for them, since that
         * decides what a builder's agent will be asked and by whom: every
         * step here is a tool except the two that move money, which are the
         * owner's own and have no tool at all.
         */
        return { data: { ...integrationKit(origin), hireFlow: HIRE_TOOL_CHAIN } };
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
