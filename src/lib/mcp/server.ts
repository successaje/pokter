/**
 * Pokter as an MCP server: a read-only doorway for AI assistants.
 *
 * BNB's Set and Earn asks people to learn what makes an agent worth hiring
 * by becoming its customer. Many of them work through an assistant, which
 * speaks MCP. This lets the assistant search agents, read the evidence, ask
 * an agent for a signed price and hand its user a hire link, while Pokter
 * never moves money: every tool is a read, and a hire is always finished by
 * the person in their own wallet.
 *
 * Streamable HTTP, stateless: each POST is answered with JSON. Revisions
 * that open with `initialize` get it (no session is needed afterwards), and
 * the stateless revision works without it. No tool reads or writes anything
 * the public API does not.
 */

export const SERVER_INFO = { name: 'pokter', title: 'Pokter: BNB Chain agent marketplace', version: '1.0.0' } as const;
export const SUPPORTED_REVISIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;

export const INSTRUCTIONS =
  'Pokter is the agent marketplace for BNB Chain: it lists ERC-8004 AI agents that can be hired through ERC-8183 escrow, with evidence for each (whether it answered Pokter’s checks, its signed price, paid deliveries and receipts). ' +
  'Use it when the user wants to find, vet, price or hire an AI agent on BNB Chain, or is building one to be hired. ' +
  'Use search_agents to find agents for a task, get_agent for one agent’s evidence and anything blocking a hire, get_quote to ask an agent for a free signed price for a brief (this sends the brief to the agent’s own endpoint), and hire_link to give the user a link where they review and fund the hire in their own wallet. ' +
  'Nothing here moves money; never say a hire has been made until the user has funded it.';

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** A `ui://` view (MCP Apps) that hosts able to render one show for this tool's result. */
  ui?: string;
  run: (args: Record<string, unknown>) => Promise<{ data: unknown; isError?: boolean }>;
}

/** A resource the server serves: here, the MCP Apps views. */
export interface McpResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  text: string;
  /** Per the MCP Apps spec: rendering preferences and the view's sandbox policy. */
  meta?: Record<string, unknown>;
}

type RpcId = string | number | null;
interface RpcRequest {
  jsonrpc?: unknown;
  id?: RpcId;
  method?: unknown;
  params?: unknown;
}

const error = (id: RpcId, code: number, message: string) => ({ jsonrpc: '2.0' as const, id, error: { code, message } });
const result = (id: RpcId, value: unknown) => ({ jsonrpc: '2.0' as const, id, result: value });

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Every tool is a read against Pokter or, for get_quote, a free signed-price request to an agent. */
const ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

async function handle(message: RpcRequest, tools: readonly McpTool[], resources: readonly McpResource[]): Promise<unknown | null> {
  const id = message.id ?? null;
  const isNotification = message.id === undefined;
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return isNotification ? null : error(id, -32600, 'Invalid request: expected JSON-RPC 2.0 with a method.');
  }
  // Notifications (initialized, cancelled, …) need no answer.
  if (isNotification) return null;

  switch (message.method) {
    case 'initialize': {
      const asked = object(message.params).protocolVersion;
      const protocolVersion = SUPPORTED_REVISIONS.includes(asked as (typeof SUPPORTED_REVISIONS)[number]) ? asked : SUPPORTED_REVISIONS[0];
      return result(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false }, ...(resources.length ? { resources: { listChanged: false } } : {}) },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return result(id, {});
    case 'tools/list':
      return result(id, {
        tools: tools.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          // A quote is asked of the agent afresh each call, so it is not idempotent.
          annotations: { title: tool.title, ...ANNOTATIONS, ...(tool.name === 'get_quote' ? { idempotentHint: false } : {}) },
          // MCP Apps: hosts that render views show this one with the result; others ignore it.
          ...(tool.ui ? { _meta: { ui: { resourceUri: tool.ui } } } : {}),
        })),
      });
    case 'resources/list':
      return result(id, { resources: resources.map(({ uri, name, description, mimeType }) => ({ uri, name, description, mimeType })) });
    case 'resources/read': {
      const uri = object(message.params).uri;
      const found = resources.find((r) => r.uri === uri);
      if (!found) return error(id, -32002, `Resource not found: ${String(uri)}`);
      return result(id, { contents: [{ uri: found.uri, mimeType: found.mimeType, text: found.text, ...(found.meta ? { _meta: found.meta } : {}) }] });
    }
    case 'tools/call': {
      const params = object(message.params);
      const tool = tools.find((t) => t.name === params.name);
      if (!tool) return error(id, -32602, `Unknown tool: ${String(params.name)}. Call tools/list for the tools Pokter offers.`);
      try {
        const { data, isError } = await tool.run(object(params.arguments));
        return result(id, {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          structuredContent: typeof data === 'object' && data !== null && !Array.isArray(data) ? data : { result: data },
          isError: Boolean(isError),
        });
      } catch (caught) {
        // A tool failure is the tool's result, not a protocol error, so the assistant can read and recover from it.
        return result(id, { content: [{ type: 'text', text: (caught as Error).message }], isError: true });
      }
    }
    default:
      return error(id, -32601, `Method not found: ${message.method}`);
  }
}

/** One POST body, a single message or a batch, answered; null when it held only notifications. */
export async function answerMcp(body: unknown, tools: readonly McpTool[], resources: readonly McpResource[] = []): Promise<unknown | null> {
  if (Array.isArray(body)) {
    const answers = (await Promise.all(body.map((m) => handle(object(m) as RpcRequest, tools, resources)))).filter((a) => a !== null);
    return answers.length ? answers : null;
  }
  return handle(object(body) as RpcRequest, tools, resources);
}
