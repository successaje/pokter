import assert from 'node:assert/strict';
import test from 'node:test';

import { callsIn } from '../src/lib/mcp/usage';

/*
 * Which MCP tool calls get counted, and which do not.
 *
 * The registry listing is the first route to Pokter where the buyer never
 * loads a page, so the browser funnel sees none of it and "is the channel
 * used" has no answer without this. A counter that miscounts is worse
 * than none: it would answer the question wrongly and look like evidence.
 *
 * Pure on purpose — a request and its answer in, pairs out. The store
 * beside it keeps the numbers; this decides what the numbers are.
 */

const call = (id: number | string, name: string) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: { task: 'private' } } });
const ok = (id: number | string) => ({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'fine' }], isError: false } });

test('a tool call that worked is counted once, as answered', () => {
  assert.deepEqual(callsIn(call(1, 'search_agents'), ok(1)), [{ tool: 'search_agents', ok: true }]);
});

test('a tool that reports its own failure is counted as failed, not skipped', () => {
  /*
   * `isError` is how a tool says the work failed while the call itself
   * succeeded — an agent that would not quote, a job that does not exist.
   * The assistant did not get what it asked for, so it is a failed call:
   * counting it as answered would make a broken tool look used and well.
   */
  const answer = { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'no quote' }], isError: true } };
  assert.deepEqual(callsIn(call(1, 'get_quote'), answer), [{ tool: 'get_quote', ok: false }]);
});

test('a protocol error is a failed call too', () => {
  const answer = { jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'bad arguments' } };
  assert.deepEqual(callsIn(call(1, 'get_agent'), answer), [{ tool: 'get_agent', ok: false }]);
});

test('a batch is matched by id, not by the order the answers came back', () => {
  /*
   * JSON-RPC does not promise a batch is answered in order. Pairing by
   * position would blame the wrong tool for a failure, which is the
   * quietest way for this to be wrong.
   */
  const body = [call(1, 'search_agents'), call(2, 'get_quote'), call('x', 'job_status')];
  const answer = [
    { jsonrpc: '2.0', id: 'x', result: { content: [], isError: true } },
    ok(1),
    { jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'rate limited' } },
  ];
  assert.deepEqual(callsIn(body, answer), [
    { tool: 'search_agents', ok: true },
    { tool: 'get_quote', ok: false },
    { tool: 'job_status', ok: false },
  ]);
});

test('only tool calls are counted: a handshake and a listing are not traffic', () => {
  /*
   * `initialize` and `tools/list` happen on every connection whether or
   * not the assistant goes on to use anything. Counting them would turn
   * one curious client into a column of activity.
   */
  const body = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    call(3, 'search_agents'),
  ];
  assert.deepEqual(callsIn(body, [ok(1), ok(2), ok(3)]), [{ tool: 'search_agents', ok: true }]);
});

test('a notification is counted as made, since nothing can come back for it', () => {
  const body = { jsonrpc: '2.0', method: 'tools/call', params: { name: 'search_agents' } };
  assert.deepEqual(callsIn(body, null), [{ tool: 'search_agents', ok: true }]);
});

test('a malformed call is not counted rather than counted under a made-up name', () => {
  for (const body of [
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} },
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: '' } },
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 42 } },
    { jsonrpc: '2.0', id: 1, method: 'tools/call' },
    null,
    'nonsense',
  ]) {
    assert.deepEqual(callsIn(body, ok(1)), [], JSON.stringify(body));
  }
});

test('nothing from the arguments reaches the count', () => {
  /*
   * What a stranger asked an agent for is theirs. The pair carries a tool
   * name and a verdict, and the brief must not ride along in either.
   */
  const pairs = callsIn(call(1, 'prepare_hire'), ok(1));
  assert.equal(JSON.stringify(pairs).includes('private'), false, 'an argument reached the counted pair');
  assert.deepEqual(Object.keys(pairs[0]!).sort(), ['ok', 'tool']);
});
