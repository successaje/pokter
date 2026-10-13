import assert from 'node:assert/strict';
import test from 'node:test';

import { extractAnswer, isPaidOnlyRefusal, isQuoteReply, pickWorkSkill } from '../src/lib/erc8183/courier-parse';

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

test('negotiation and notification skills are plumbing whatever they are called', () => {
  assert.deepEqual(pickWorkSkill([{ id: 'negotiate-erc8183-job' }, { id: 'notifyFunded' }, { id: 'health-factor' }]), { id: 'health-factor', name: 'health-factor' });
  assert.equal(pickWorkSkill([{ id: 'health' }, { id: 'negotiate' }, { id: 'notify_funded' }]), null);
});

test('output in a task artifact is read', () => {
  const answer = extractAnswer({ result: { id: 't', status: { state: 'completed' }, artifacts: [{ parts: [{ kind: 'data', data: { health_factor: 1.6 } }] }] } });
  assert.deepEqual(answer, { text: null, data: { health_factor: 1.6 } });
});

test('a price quote is not an answer, at the top level or inside a data part', () => {
  assert.equal(extractAnswer({ result: { status: 'quoted', price: '1', negotiation_hash: '0xab', provider_sig: '0xcd' } }), null);
  assert.equal(extractAnswer({ result: { parts: [{ kind: 'data', data: { negotiation_hash: '0xab', provider_sig: '0xcd', price: '1' } }] } }), null);
  assert.equal(isQuoteReply({ health_factor: 1.2 }), false);
});

test('a skill named "health" that describes position work is the work skill', () => {
  // The real card: its only work skill is `health`, a position health report.
  const skills = [
    { id: 'health', name: 'Position health report', description: 'Lending health: given collateral rows with liquidation thresholds, debt and prices, returns the health factor.' },
    { id: 'negotiate', name: 'Negotiate an ERC-8183 job' },
    { id: 'notify_funded', name: 'Notify the seller a job is funded' },
  ];
  assert.deepEqual(pickWorkSkill(skills), { id: 'health', name: 'Position health report' });
});

test('a bare "health" or "status" liveness skill is still plumbing', () => {
  assert.equal(pickWorkSkill([{ id: 'health', name: 'Health check', description: 'Returns ok when the service is up.' }]), null);
  assert.equal(pickWorkSkill([{ id: 'status' }]), null);
});

test('"unknown skill" listing only escrow skills means the agent works only when paid', () => {
  // The real reply from the health-factor agent asked directly.
  assert.equal(isPaidOnlyRefusal({ data: { error: 'unknown skill: "health"', skills: ['negotiate', 'notify_funded'] } }), true);
  // An unknown skill with real work skills on offer is a different problem.
  assert.equal(isPaidOnlyRefusal({ data: { error: 'unknown skill: "x"', skills: ['negotiate', 'screen-token'] } }), false);
  assert.equal(isPaidOnlyRefusal({ data: { health_factor: 1.4 } }), false);
  assert.equal(isPaidOnlyRefusal(null), false);
});
