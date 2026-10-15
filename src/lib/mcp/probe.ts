import { readRpcResponse } from '@/lib/protocol/stream';

/**
 * Listing an MCP server's tools without invoking any of them.
 *
 * Revisions up to 2025-11-25 open with a lifecycle: `initialize`, then
 * `notifications/initialized`, then requests carrying the session id the
 * server issued. The current revision (2026-07-28) is stateless: every
 * request carries its own version and client metadata. Pokter sent
 * `tools/list` straight away to every server, which a stateless server
 * answers and a strict legacy one refuses for want of a session.
 *
 * So the direct call is tried first, as before, since it is one request and
 * most servers answer it. When it is refused and the server is not known to
 * be stateless, the legacy handshake runs once. A protocol error (a JSON-RPC
 * error object) is reported as that, separately from an HTTP failure, and
 * no tool is ever called: listing is enough to know the server is there.
 */

export const STATELESS_REVISION = '2026-07-28';
const MAX_PAGES = 5;
const MAX_TOOLS = 100;
const MAX_SCHEMA_CHARS = 4_000;

export interface McpTool {
  name: string;
  description: string | null;
  /** The tool's declared input schema, kept so a brief can be checked against it; trimmed when huge. */
  inputSchema: Record<string, unknown> | null;
}

export interface McpListing {
  ok: boolean;
  status: number | null;
  detail: string;
  tools: McpTool[];
  /** Whether the legacy initialize handshake was needed. */
  handshake: boolean;
  /** A JSON-RPC error the server returned, distinct from an HTTP failure. */
  protocolError: { code: number | null; message: string } | null;
}

export type McpFetch = (init: RequestInit) => Promise<Response>;

const CLIENT = { name: 'pokter-prober', version: '1.1' };

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Whether `version` is a revision that needs the initialize handshake. Unknown counts as maybe. */
export function needsHandshake(version: string | null): boolean {
  return version === null || version < STATELESS_REVISION;
}

export function toolsFrom(result: unknown): McpTool[] | null {
  const tools = object(result)?.tools;
  if (!Array.isArray(tools)) return null;
  return tools.slice(0, MAX_TOOLS).flatMap((entry) => {
    const tool = object(entry);
    if (!tool || typeof tool.name !== 'string') return [];
    const schema = object(tool.inputSchema);
    return [{
      name: tool.name,
      description: typeof tool.description === 'string' ? tool.description.slice(0, 500) : null,
      inputSchema: schema && JSON.stringify(schema).length <= MAX_SCHEMA_CHARS ? schema : schema ? { type: 'object', note: 'schema omitted: larger than Pokter keeps' } : null,
    }];
  });
}

interface Exchange {
  status: number;
  session: string | null;
  message: Record<string, unknown> | null;
}

async function call(fetcher: McpFetch, body: Record<string, unknown>, headers: Record<string, string>, maxBytes: number): Promise<Exchange> {
  const response = await fetcher({
    method: 'POST',
    headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const session = response.headers.get('mcp-session-id');
  // A notification is acknowledged with 202 and no body.
  if (!('id' in body) || !response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return { status: response.status, session, message: null };
  }
  return { status: response.status, session, message: object(await readRpcResponse(response, { expectId: body.id as string, maxBytes })) };
}

function rpcError(message: Record<string, unknown> | null): McpListing['protocolError'] {
  const error = object(message?.error);
  if (!error) return null;
  return { code: typeof error.code === 'number' ? error.code : null, message: typeof error.message === 'string' ? error.message.slice(0, 200) : 'No message' };
}

async function listPages(fetcher: McpFetch, headers: Record<string, string>, maxBytes: number, meta: boolean): Promise<Omit<McpListing, 'handshake'>> {
  const tools: McpTool[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, unknown> = {};
    if (cursor) params.cursor = cursor;
    if (meta) params._meta = { 'io.modelcontextprotocol/clientInfo': CLIENT };
    const exchange = await call(fetcher, { jsonrpc: '2.0', id: `pokter-tools-${page}`, method: 'tools/list', params }, { ...headers, 'mcp-method': 'tools/list' }, maxBytes);
    if (exchange.status < 200 || exchange.status >= 300) {
      return { ok: false, status: exchange.status, detail: `Endpoint answered ${exchange.status}.`, tools, protocolError: null };
    }
    const error = rpcError(exchange.message);
    if (error) {
      return { ok: false, status: exchange.status, detail: `MCP protocol error${error.code !== null ? ` ${error.code}` : ''}: ${error.message}`, tools, protocolError: error };
    }
    const result = object(exchange.message?.result);
    const pageTools = toolsFrom(result);
    if (exchange.message?.jsonrpc !== '2.0' || !pageTools) {
      return { ok: false, status: exchange.status, detail: 'Endpoint returned JSON, but not a valid MCP tools/list response.', tools, protocolError: null };
    }
    tools.push(...pageTools);
    cursor = typeof result?.nextCursor === 'string' && result.nextCursor ? result.nextCursor : null;
    if (!cursor || tools.length >= MAX_TOOLS) break;
  }
  return {
    ok: true,
    status: 200,
    detail: `MCP capability handshake succeeded${tools.length ? ` with ${tools.length} declared tools` : ''}${cursor ? ` (first ${MAX_PAGES} pages)` : ''}.`,
    tools,
    protocolError: null,
  };
}

/** The legacy lifecycle: initialize, initialized, then list with the session. */
async function listWithHandshake(fetcher: McpFetch, version: string, maxBytes: number): Promise<Omit<McpListing, 'handshake'>> {
  const init = await call(
    fetcher,
    { jsonrpc: '2.0', id: 'pokter-initialize', method: 'initialize', params: { protocolVersion: version, capabilities: {}, clientInfo: CLIENT } },
    {},
    maxBytes,
  );
  if (init.status < 200 || init.status >= 300) return { ok: false, status: init.status, detail: `Endpoint answered ${init.status} to initialize.`, tools: [], protocolError: null };
  const error = rpcError(init.message);
  if (error) return { ok: false, status: init.status, detail: `MCP protocol error${error.code !== null ? ` ${error.code}` : ''} on initialize: ${error.message}`, tools: [], protocolError: error };
  const negotiated = object(init.message?.result)?.protocolVersion;
  const agreed = typeof negotiated === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(negotiated) ? negotiated : version;
  const headers: Record<string, string> = { 'mcp-protocol-version': agreed };
  if (init.session) headers['mcp-session-id'] = init.session;
  await call(fetcher, { jsonrpc: '2.0', method: 'notifications/initialized' }, headers, maxBytes);
  const listed = await listPages(fetcher, headers, maxBytes, false);
  // Release the session; a server that does not support it says 405, which is fine.
  if (init.session) await fetcher({ method: 'DELETE', headers }).then((r) => r.body?.cancel()).catch(() => undefined);
  return listed.ok ? { ...listed, detail: `${listed.detail} Needed the initialize handshake (MCP ${agreed}).` } : listed;
}

export async function listMcpTools(fetcher: McpFetch, { version, maxBytes }: { version: string | null; maxBytes: number }): Promise<McpListing> {
  const direct = await listPages(fetcher, { 'mcp-protocol-version': version ?? STATELESS_REVISION }, maxBytes, true);
  if (direct.ok || !needsHandshake(version)) return { ...direct, handshake: false };
  // Refused or not understood: a legacy server may want a session first.
  const legacy = await listWithHandshake(fetcher, version ?? '2025-06-18', maxBytes).catch(() => null);
  return legacy?.ok ? { ...legacy, handshake: true } : { ...direct, handshake: false };
}
