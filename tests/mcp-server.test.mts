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
  const missing = (await answerMcp({ jsonrpc: '2.0', id: 6, method: 'resources/list' }, [echo])) as { error: { code: number } };
  assert.equal(missing.error.code, -32601);
});

test('notifications get no answer, and a batch answers each request', async () => {
  assert.equal(await answerMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, [echo]), null);
  const batch = (await answerMcp([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }], [echo])) as unknown[];
  assert.equal(batch.length, 1);
});
