import assert from 'node:assert/strict';
import test from 'node:test';

import { structuredProfile, type StructuredInput } from '../src/features/agent/structured';

const base: StructuredInput = {
  description: '',
  skills: [],
  sample: null,
  category: null,
  hireBlocker: null,
  warnings: [],
};

test('an agent with nothing published fills no section', () => {
  const s = structuredProfile(base);
  assert.equal(s.does.text, null);
  assert.equal(s.send.example, null);
  assert.equal(s.send.answered, null);
  assert.equal(s.back.result, null);
  assert.equal(s.back.jobId, null);
  assert.deepEqual(s.goodFor.skills, []);
  assert.deepEqual(s.limits, []);
});

test('the paid skill’s example is the brief offered, ahead of a free one', () => {
  const s = structuredProfile({
    ...base,
    skills: [
      { name: 'preview', kind: 'preview', examples: ['free example'] },
      { name: 'review', kind: 'paid', examples: ['Review position 123 for wallet 0xabc'] },
    ],
  });
  assert.deepEqual(s.send.example, { text: 'Review position 123 for wallet 0xabc', by: 'operator' });
});

test('a lifecycle demonstration is never shown as the agent’s answer or its brief', () => {
  const s = structuredProfile({
    ...base,
    sample: { jobId: '7', kind: 'lifecycle', asked: 'a brief', title: 'Receipt', fields: [], result: 'settled', limitations: ['seller note'] },
  });
  assert.equal(s.back.result, null);
  assert.equal(s.back.jobId, null);
  assert.equal(s.back.lifecycleOnly, true);
  assert.equal(s.send.answered, null);
  assert.deepEqual(s.limits, []);
});

test('a real answer supplies the result, the brief it answered and its own limits', () => {
  const s = structuredProfile({
    ...base,
    sample: { jobId: '1543', kind: 'agent', asked: 'What is my health factor?', title: null, fields: [], result: 'Health factor 1.42', limitations: ['Venus Core Pool only'] },
    warnings: ['It did not answer Pokter’s live check when this page loaded.'],
  });
  assert.equal(s.back.result, 'Health factor 1.42');
  assert.equal(s.back.jobId, '1543');
  assert.deepEqual(s.send.answered, { text: 'What is my health factor?', jobId: '1543' });
  assert.deepEqual(s.limits.map((l) => l.by), ['agent', 'pokter']);
});

test('without a stated result, the first readable field stands in', () => {
  const s = structuredProfile({
    ...base,
    sample: { jobId: '2', kind: 'relayed', asked: null, title: null, fields: [{ label: 'range', value: { lower: 1800, upper: 2200 } }], result: null, limitations: [] },
  });
  assert.equal(s.back.result, 'range: lower 1800 · upper 2200');
  assert.equal(s.back.relayed, true);
});

test('the same limit said twice is listed once', () => {
  const s = structuredProfile({ ...base, hireBlocker: { reason: 'Its price is unsigned.' }, warnings: ['Its price is unsigned.'] });
  assert.equal(s.limits.length, 1);
});

test('good for lists capability skills, not the paid and preview plumbing', () => {
  const s = structuredProfile({
    ...base,
    skills: [
      { name: 'negotiate', kind: 'paid', examples: [] },
      { name: 'Health factor', kind: 'capability', examples: [] },
    ],
    category: { label: 'Health factor', source: 'declared' },
  });
  assert.deepEqual(s.goodFor.skills, ['Health factor']);
  assert.deepEqual(s.goodFor.category, { label: 'Health factor', declared: true });
});
