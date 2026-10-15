import assert from 'node:assert/strict';
import test from 'node:test';

import { notAnAnswer, readA2AReply } from '../src/lib/a2a/reply';
import { extractAnswer } from '../src/lib/erc8183/courier-parse';

const rpc = (result: unknown) => ({ jsonrpc: '2.0', id: 1, result });
const task = (state: string, extra: Record<string, unknown> = {}) => rpc({ kind: 'task', id: 't-1', status: { state, message: { role: 'agent', parts: [{ kind: 'text', text: `status: ${state}` }] } }, ...extra });

test('a message is a final answer', () => {
  const reply = readA2AReply(rpc({ kind: 'message', role: 'agent', parts: [{ kind: 'data', data: { verdict: 'Safe' } }] }));
  assert.equal(reply.state, 'completed');
  assert.deepEqual(reply.data, { verdict: 'Safe' });
  assert.equal(notAnAnswer(reply), null);
});

test("a working, input-required or failed task is never delivered as the answer", () => {
  for (const state of ['working', 'submitted', 'input-required', 'failed', 'rejected', 'canceled']) {
    assert.equal(extractAnswer(task(state)), null, state);
  }
  assert.match(notAnAnswer(readA2AReply(task('working'))) ?? '', /still working on it \(task t-1\)/);
  assert.match(notAnAnswer(readA2AReply(task('input-required'))) ?? '', /needs more input.*status: input-required/);
  assert.match(notAnAnswer(readA2AReply(task('failed'))) ?? '', /reported the task failed/);
});

test("a completed task's answer comes from its artifacts", () => {
  const done = task('completed', { artifacts: [{ artifactId: 'a', parts: [{ kind: 'data', data: { healthFactor: 1.98 } }] }] });
  assert.deepEqual(extractAnswer(done), { text: null, data: { healthFactor: 1.98 } });
  // With no artifacts, the status message is the answer.
  assert.equal(extractAnswer(task('completed'))?.text, 'status: completed');
});

test('a JSON-RPC error is a failure with its message', () => {
  const reply = readA2AReply({ jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'boom' } });
  assert.equal(reply.kind, 'error');
  assert.match(notAnAnswer(reply) ?? '', /error: boom/);
});

test('a quote or notice answer wrapped in a completed task is read, not missed', () => {
  const quote = task('completed', { artifacts: [{ parts: [{ kind: 'data', data: { negotiation_hash: '0xabc', provider_sig: '0xdef' } }] }] });
  assert.deepEqual(readA2AReply(quote).data, { negotiation_hash: '0xabc', provider_sig: '0xdef' });
});
