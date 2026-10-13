import assert from 'node:assert/strict';
import test from 'node:test';

import { EVALUATOR_ATTESTATION_EXAMPLE, EVALUATOR_ATTESTATION_SCHEMA } from '../src/lib/evaluators/schema';
import { isScorableAttestationBody, normaliseValue } from '../src/lib/proof/attestation';

test('the published evaluator example satisfies Pokter minimum scoring rules', () => {
  assert.equal(isScorableAttestationBody(EVALUATOR_ATTESTATION_EXAMPLE), true);
  assert.equal(normaliseValue(EVALUATOR_ATTESTATION_EXAMPLE.value, EVALUATOR_ATTESTATION_EXAMPLE.valueDecimals), 0.99);
  assert.deepEqual(EVALUATOR_ATTESTATION_SCHEMA.required, ['agentRegistry', 'agentId', 'createdAt', 'tag1', 'reasoning', 'method']);
});

test('one success with no window is not a scorable measurement', () => {
  assert.equal(isScorableAttestationBody({ tag1: 'uptime', method: { probes: 1, answered: 1 } }), false);
});

test('answered probes cannot exceed attempts', () => {
  assert.equal(isScorableAttestationBody({
    ...EVALUATOR_ATTESTATION_EXAMPLE,
    method: { ...EVALUATOR_ATTESTATION_EXAMPLE.method, probes: 3, answered: 4 },
  }), false);
});

test('method limitations are bounded strings rather than executable payloads', () => {
  assert.equal(isScorableAttestationBody({
    ...EVALUATOR_ATTESTATION_EXAMPLE,
    method: { ...EVALUATOR_ATTESTATION_EXAMPLE.method, knownDefects: ['x'.repeat(301)] },
  }), false);
});

test('a claimed label is not enough without reproducible identity and method fields', () => {
  assert.equal(isScorableAttestationBody({
    tag1: 'uptime',
    reasoning: 'Looks healthy.',
    method: { measuredBy: 'Famous evaluator', probes: 100, answered: 100, windowDays: 7 },
  }), false);
});
