import assert from 'node:assert/strict';
import test from 'node:test';

import { builderChecklist, type ChecklistInput } from '../src/lib/builder/checklist';

const base: ChecklistInput = {
  identity: { done: true, missing: [] },
  endpoint: { checked: true, ok: true, detail: null, status: 200 },
  capabilities: ['negotiate', 'venus_health'],
  quoteCapability: true,
  trial: { ran: false, ok: false, summary: null, error: null },
};
const statuses = (input: ChecklistInput) => Object.fromEntries(builderChecklist(input).map((s) => [s.id, s.status]));

test('a draft that passes everything checkable is ready, and the price is honestly "after publish"', () => {
  assert.deepEqual(statuses(base), { identity: 'done', endpoint: 'done', inputs: 'done', price: 'after-publish', 'test-delivery': 'optional', ready: 'done' });
});

test('a failed endpoint shows the exact reason and the fix, and blocks what depends on it', () => {
  const stages = builderChecklist({ ...base, endpoint: { checked: true, ok: false, detail: 'No agent card at /.well-known/agent-card.json', status: 404 } });
  const endpoint = stages.find((s) => s.id === 'endpoint')!;
  assert.equal(endpoint.status, 'failed');
  assert.equal(endpoint.detail, 'No agent card at /.well-known/agent-card.json (HTTP 404)');
  assert.equal(endpoint.fix?.href, '/build/integration#transports');
  assert.equal(stages.find((s) => s.id === 'inputs')!.status, 'todo', 'not failed: never read');
  assert.equal(stages.find((s) => s.id === 'ready')!.status, 'todo');
});

test('no hireable skill, or no negotiation skill, fails with its own fix', () => {
  assert.equal(statuses({ ...base, capabilities: ['negotiate'] }).inputs, 'failed');
  const noQuote = builderChecklist({ ...base, quoteCapability: false });
  assert.equal(noQuote.find((s) => s.id === 'price')!.fix?.href, '/build/integration#quote');
  assert.equal(noQuote.find((s) => s.id === 'ready')!.status, 'todo');
});

test('a test delivery is optional, and its failure is shown without blocking publication', () => {
  const failedTrial = statuses({ ...base, trial: { ran: true, ok: false, summary: null, error: 'Timed out after 20s' } });
  assert.equal(failedTrial['test-delivery'], 'failed');
  assert.equal(failedTrial.ready, 'done');
});

test('identity lists what is missing', () => {
  const stage = builderChecklist({ ...base, identity: { done: false, missing: ['a description', 'a category'] } })[0];
  assert.equal(stage.detail, 'Still to set: a description, a category.');
});

test('a check that could not run is a failure with its reason, not "to do"', () => {
  const stage = builderChecklist({ ...base, endpoint: { checked: false, ok: false, detail: null, status: null, error: 'Too many checks from this connection. Wait a minute.' } })[1];
  assert.equal(stage.status, 'failed');
  assert.match(stage.detail, /could not run: Too many checks/);
});

test('quote-like skills are not counted as work a buyer can hire', () => {
  assert.equal(statuses({ ...base, capabilities: ['get_price', 'quote_job'] }).inputs, 'failed');
});
