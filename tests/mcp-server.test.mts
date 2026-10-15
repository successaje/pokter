import assert from 'node:assert/strict';
import test from 'node:test';

import { answerMcp, SUPPORTED_REVISIONS, type McpTool } from '../src/lib/mcp/server';

const echo: McpTool = {
  name: 'echo', title: 'Echo', description: 'Returns its input.',
  inputSchema: { type: 'object', properties: { x: { type: 'number' } } },
  run: async (args) => ({ data: { got: args.x ?? null } }),
};
const boom: McpTool = { ...echo, name: 'boom', run: async () => { throw new Error('upstream refused'); } };

test('initialize agrees a revision the client asked for, or offers the latest', async () => {
  const known = (await answerMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, [echo])) as { result: { protocolVersion: string; serverInfo: { name: string } } };
  assert.equal(known.result.protocolVersion, '2025-06-18');
  assert.equal(known.result.serverInfo.name, 'pokter');
  const unknown = (await answerMcp({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, [echo])) as { result: { protocolVersion: string } };
  assert.equal(unknown.result.protocolVersion, SUPPORTED_REVISIONS[0]);
});

test('tools are listed as read-only, and a call returns text and structured content', async () => {
  const list = (await answerMcp({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, [echo])) as { result: { tools: Array<{ name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean } }> } };
  assert.equal(list.result.tools[0].annotations.readOnlyHint, true);
  assert.equal(list.result.tools[0].annotations.destructiveHint, false);
  const call = (await answerMcp({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'echo', arguments: { x: 7 } } }, [echo])) as { result: { structuredContent: { got: number }; isError: boolean; content: Array<{ text: string }> } };
  assert.deepEqual(call.result.structuredContent, { got: 7 });
  assert.equal(call.result.isError, false);
  assert.match(call.result.content[0].text, /"got": 7/);
});

test('a failing tool is a tool error the assistant can read; an unknown method is a protocol error', async () => {
  const failed = (await answerMcp({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'boom' } }, [boom])) as { result: { isError: boolean; content: Array<{ text: string }> } };
  assert.equal(failed.result.isError, true);
  assert.equal(failed.result.content[0].text, 'upstream refused');
  const missing = (await answerMcp({ jsonrpc: '2.0', id: 6, method: 'prompts/list' }, [echo])) as { error: { code: number } };
  assert.equal(missing.error.code, -32601);
});

test('notifications get no answer, and a batch answers each request', async () => {
  assert.equal(await answerMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, [echo]), null);
  const batch = (await answerMcp([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }], [echo])) as unknown[];
  assert.equal(batch.length, 1);
});

test('a tool names its view, and the view is served as an MCP App resource', async () => {
  const withUi = { ...echo, name: 'card', ui: 'ui://pokter/agent-card' };
  const view = { uri: 'ui://pokter/agent-card', name: 'Agent card', description: 'x', mimeType: 'text/html;profile=mcp-app', text: '<!doctype html>', meta: { ui: { prefersBorder: false } } };
  const init = (await answerMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, [withUi], [view])) as { result: { capabilities: Record<string, unknown> } };
  assert.ok(init.result.capabilities.resources);
  const list = (await answerMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, [withUi], [view])) as { result: { tools: Array<{ _meta?: { ui?: { resourceUri: string } } }> } };
  assert.equal(list.result.tools[0]._meta?.ui?.resourceUri, 'ui://pokter/agent-card');
  const read = (await answerMcp({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'ui://pokter/agent-card' } }, [withUi], [view])) as { result: { contents: Array<{ mimeType: string; text: string; _meta: unknown }> } };
  assert.equal(read.result.contents[0].mimeType, 'text/html;profile=mcp-app');
  assert.deepEqual(read.result.contents[0]._meta, { ui: { prefersBorder: false } });
  const missing = (await answerMcp({ jsonrpc: '2.0', id: 4, method: 'resources/read', params: { uri: 'ui://nope' } }, [withUi], [view])) as { error: { code: number } };
  assert.equal(missing.error.code, -32002);
});
