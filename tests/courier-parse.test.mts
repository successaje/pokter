import assert from 'node:assert/strict';
import test from 'node:test';

import { extractAnswer, pickWorkSkill } from '../src/lib/erc8183/courier-parse';

test('the brief goes to the first skill that is work, never to plumbing', () => {
  assert.deepEqual(pickWorkSkill([{ id: 'negotiate' }, { id: 'notify_funded' }, { id: 'health_factor', name: 'Health factor' }]), { id: 'health_factor', name: 'Health factor' });
  assert.equal(pickWorkSkill([{ id: 'negotiate' }]), null);
  assert.equal(pickWorkSkill(undefined), null);
});

test('an answer is text parts joined and the first data part', () => {
  const answer = extractAnswer({ result: { parts: [{ kind: 'text', text: 'Health factor 1.14.' }, { kind: 'data', data: { health_factor: 1.14 } }, { kind: 'text', text: 'Repay $4.' }] } });
  assert.deepEqual(answer, { text: 'Health factor 1.14.\n\nRepay $4.', data: { health_factor: 1.14 } });
});

test('a task-shaped reply is read from its status message', () => {
  const answer = extractAnswer({ result: { id: 't1', status: { state: 'completed', message: { parts: [{ kind: 'text', text: 'Done.' }] } } } });
  assert.deepEqual(answer, { text: 'Done.', data: null });
});

test('nothing to deliver is null, not an empty delivery', () => {
  assert.equal(extractAnswer({ result: { parts: [{ kind: 'data', data: {} }] } }), null);
  assert.equal(extractAnswer({ error: { code: -32600 } }), null);
  assert.equal(extractAnswer('nonsense'), null);
});
