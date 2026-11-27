import assert from 'node:assert/strict';
import test from 'node:test';

import { EVALUATOR_ATTESTATION_EXAMPLE, EVALUATOR_ATTESTATION_SCHEMA } from '../src/lib/evaluators/schema';
import { attestationGaps, isScorableAttestationBody, normaliseValue, type Attestation } from '../src/lib/proof/attestation';
import { summarisePublishedEvidence } from '../src/lib/proof/published';

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

/*
 * A measurer who publishes and sees nothing change cannot tell whether the
 * receipt was missed or refused. These cover the fields the page names back.
 */

test('a receipt with no body is refused for the fields the schema requires, and does not list method internals it cannot see', () => {
  assert.deepEqual(attestationGaps(null), ['agentRegistry', 'agentId', 'createdAt', 'tag1', 'reasoning', 'method']);
  assert.deepEqual(attestationGaps({}), ['agentRegistry', 'agentId', 'createdAt', 'tag1', 'reasoning', 'method']);
});

test('a body that is whole except for one method field names only that field', () => {
  const gaps = attestationGaps({
    ...EVALUATOR_ATTESTATION_EXAMPLE,
    method: { ...EVALUATOR_ATTESTATION_EXAMPLE.method, vantage: '   ' },
  });
  assert.deepEqual(gaps, ['method.vantage']);
});

test('the scorable rule is exactly "no gaps", so nothing can be refused for a reason the page cannot name', () => {
  const bodies = [
    null,
    {},
    EVALUATOR_ATTESTATION_EXAMPLE,
    { ...EVALUATOR_ATTESTATION_EXAMPLE, tag1: '' },
    { ...EVALUATOR_ATTESTATION_EXAMPLE, reasoning: '' },
    { ...EVALUATOR_ATTESTATION_EXAMPLE, agentRegistry: 'eip155:1:0x0000000000000000000000000000000000000000' },
    { ...EVALUATOR_ATTESTATION_EXAMPLE, method: { ...EVALUATOR_ATTESTATION_EXAMPLE.method, probes: 0 } },
  ];
  for (const body of bodies) {
    assert.equal(isScorableAttestationBody(body), attestationGaps(body).length === 0, JSON.stringify(body)?.slice(0, 60));
  }
});

const receipt = (missing: string[], over: Partial<Attestation> = {}): Attestation => ({
  id: missing.join('-') + Math.random(),
  agentId: '341556',
  chainId: 56,
  transactionHash: '0xfeed',
  blockNumber: 1,
  ratio: 1,
  dimension: 'unspecified',
  window: null,
  measuredBy: null,
  authorAddress: '0x00000000000000000000000000000000000000aa',
  independence: 'independent',
  reasoning: null,
  method: null,
  createdAt: null,
  verified: missing.length === 0,
  missing,
  ...over,
});

test('receipts refused the same way are counted together, commonest first, and a scored one is not in the tally', () => {
  const bare = ['agentRegistry', 'agentId', 'createdAt', 'tag1', 'reasoning', 'method'];
  const summary = summarisePublishedEvidence([
    receipt(bare),
    receipt(bare),
    receipt(bare),
    receipt(['method.vantage']),
    receipt([], { verified: true }),
  ]);
  assert.equal(summary.total, 5);
  assert.equal(summary.scorable, 1);
  assert.equal(summary.unscored, 4);
  assert.deepEqual(summary.gaps.map((g) => [g.count, g.fields.join(',')]), [
    [3, bare.join(',')],
    [1, 'method.vantage'],
  ]);
});

test('a receipt with a whole body but no value is unscored, and carries no gap to report', () => {
  const summary = summarisePublishedEvidence([receipt([], { verified: true, ratio: null })]);
  assert.equal(summary.scorable, 0);
  assert.equal(summary.unscored, 1);
  assert.deepEqual(summary.gaps, [], 'the body was fine; the missing piece is the on-chain value');
});
