import assert from 'node:assert/strict';
import test from 'node:test';

import { listMcpTools, needsHandshake, type McpFetch } from '../src/lib/mcp/probe';

const MAX = 64 * 1024;
type Handler = (body: Record<string, unknown> | null, headers: Record<string, string>, method: string) => Response;

function server(handler: Handler): { fetcher: McpFetch; calls: Array<{ method: string; rpc: string | null; headers: Record<string, string> }> } {
  const calls: Array<{ method: string; rpc: string | null; headers: Record<string, string> }> = [];
  const fetcher: McpFetch = async (init) => {
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ method: init.method ?? 'GET', rpc: (body?.method as string) ?? null, headers });
    return handler(body, headers, init.method ?? 'GET');
  };
  return { fetcher, calls };
}
const json = (value: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', ...headers } });

test('a server that answers tools/list directly gets one request, and schemas are kept', async () => {
  const { fetcher, calls } = server((body) =>
    json({ jsonrpc: '2.0', id: body?.id, result: { tools: [{ name: 'health', description: 'Reads a loan', inputSchema: { type: 'object', required: ['wallet'] } }] } }),
  );
  const listing = await listMcpTools(fetcher, { version: '2025-06-18', maxBytes: MAX });
  assert.equal(listing.ok, true);
  assert.equal(listing.handshake, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers['mcp-protocol-version'], '2025-06-18');
  assert.deepEqual(listing.tools[0].inputSchema, { type: 'object', required: ['wallet'] });
});

test('a legacy server that wants a session gets initialize, initialized, then tools/list with the session', async () => {
  const { fetcher, calls } = server((body, headers, method) => {
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (body?.method === 'initialize') return json({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-03-26', capabilities: {} } }, { 'mcp-session-id': 's-1' });
    if (body?.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (headers['mcp-session-id'] !== 's-1') return new Response('Bad Request: no valid session ID', { status: 400 });
    return json({ jsonrpc: '2.0', id: body?.id, result: { tools: [{ name: 'quote' }] } });
  });
  const listing = await listMcpTools(fetcher, { version: '2025-03-26', maxBytes: MAX });
  assert.equal(listing.ok, true);
  assert.equal(listing.handshake, true);
  assert.deepEqual(calls.map((c) => c.rpc ?? c.method), ['tools/list', 'initialize', 'notifications/initialized', 'tools/list', 'DELETE']);
  assert.equal(calls[3].headers['mcp-protocol-version'], '2025-03-26');
  assert.match(listing.detail, /Needed the initialize handshake \(MCP 2025-03-26\)/);
});

test('a JSON-RPC error is a protocol error, not an HTTP failure; a stateless server is not handshaken', async () => {
  const { fetcher, calls } = server((body) => json({ jsonrpc: '2.0', id: body?.id, error: { code: -32601, message: 'Method not found' } }));
  const listing = await listMcpTools(fetcher, { version: '2026-07-28', maxBytes: MAX });
  assert.equal(listing.ok, false);
  assert.deepEqual(listing.protocolError, { code: -32601, message: 'Method not found' });
  assert.match(listing.detail, /MCP protocol error -32601/);
  assert.equal(calls.length, 1);
  assert.equal(needsHandshake('2026-07-28'), false);
  assert.equal(needsHandshake(null), true);
});

test('pages are followed by cursor, within a bound', async () => {
  const { fetcher, calls } = server((body) => {
    const cursor = (body?.params as { cursor?: string })?.cursor;
    const page = cursor ? Number(cursor) : 0;
    return json({ jsonrpc: '2.0', id: body?.id, result: { tools: [{ name: `t${page}` }], nextCursor: page < 9 ? String(page + 1) : undefined } });
  });
  const listing = await listMcpTools(fetcher, { version: null, maxBytes: MAX });
  assert.equal(listing.tools.length, 5);
  assert.equal(calls.length, 5);
  assert.match(listing.detail, /first 5 pages/);
});
