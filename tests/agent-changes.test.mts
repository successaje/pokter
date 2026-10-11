import assert from 'node:assert/strict';
import test from 'node:test';

import { agentChanges, type FollowedAgentState } from '../src/lib/notifications/agent-changes';

const base: FollowedAgentState = { answering: true, priceU: 0.1, delivered: 2, missed: 0 };
const kinds = (prev: FollowedAgentState | null, next: FollowedAgentState) => agentChanges('Keel', prev, next).map((c) => c.kind);

test('the first observation is a baseline, not news', () => {
  assert.deepEqual(kinds(null, base), []);
});

test('nothing changed, nothing sent', () => {
  assert.deepEqual(kinds(base, { ...base }), []);
});

test('going quiet and coming back are both reported', () => {
  assert.deepEqual(kinds(base, { ...base, answering: false }), ['down']);
  assert.deepEqual(kinds({ ...base, answering: false }, base), ['up']);
  // Not probed is not the same as down.
  assert.deepEqual(kinds(base, { ...base, answering: null }), []);
});

test('price moves, appears and lapses', () => {
  assert.deepEqual(kinds(base, { ...base, priceU: 0.2 }), ['price']);
  assert.deepEqual(kinds({ ...base, priceU: null }, base), ['priced']);
  assert.deepEqual(kinds(base, { ...base, priceU: null }), ['unpriced']);
});

test('delivery record changes are reported with counts', () => {
  const changes = agentChanges('Keel', base, { ...base, missed: 2, delivered: 3 });
  assert.deepEqual(changes.map((c) => c.kind), ['missed', 'delivered']);
  assert.equal(changes[0].title, 'Keel missed 2 paid jobs');
  assert.equal(changes[1].title, 'Keel delivered a paid job');
});
