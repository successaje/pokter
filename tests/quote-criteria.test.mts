import assert from 'node:assert/strict';
import test from 'node:test';

import { keccak256, toBytes } from 'viem';

import { canonicalJson, criteriaInSignedTerms, negotiationContent, negotiationTermsBound } from '../src/lib/erc8183/negotiation';

const TASK = 'Report the Venus health factor of 0x4f43d4173227bF19b180f1f54804bF2C9045297B.';
const CRITERIA = ['proofrun:0xabc', 'health_factor within 0.01 of Venus at the reported block'];

/** A seller envelope whose hash covers whatever terms it echoes. */
function envelope(terms: Record<string, unknown>) {
  const data: Record<string, unknown> = {
    negotiated_at: 1761300000,
    request: { task_description: TASK },
    response: { accepted: true, terms: { price: '100000000000000000', currency: '0xcE24439F2D9C6a2289F741120FE202248B666666', ...terms } },
  };
  const content = negotiationContent(data, TASK)!;
  data.negotiation_hash = keccak256(toBytes(canonicalJson(content)));
  return { data, content };
}

test('criteria the agent echoed inside its signed terms are agreed', () => {
  const { data, content } = envelope({ deliverables: 'x', quality_standards: 'y', success_criteria: CRITERIA });
  assert.equal(negotiationTermsBound(data, TASK), true, 'the hash covers them');
  assert.equal(criteriaInSignedTerms(CRITERIA, content), true);
});

test('criteria the agent dropped, or changed, are only recorded by Pokter', () => {
  const dropped = envelope({ deliverables: 'x', quality_standards: 'y' });
  assert.equal(criteriaInSignedTerms(CRITERIA, dropped.content), false);
  const changed = envelope({ deliverables: 'x', quality_standards: 'y', success_criteria: [CRITERIA[0]] });
  assert.equal(criteriaInSignedTerms(CRITERIA, changed.content), false, 'every criterion, not some');
  assert.equal(criteriaInSignedTerms(CRITERIA, null), false);
});

test('no criteria sent is no claim either way', () => {
  assert.equal(criteriaInSignedTerms(undefined, envelope({}).content), null);
  assert.equal(criteriaInSignedTerms([], envelope({}).content), null);
});

test('criteria are compared as the hash saw them', () => {
  const sent = ['range [0, 2]'];
  const { content } = envelope({ deliverables: 'x', quality_standards: 'y', success_criteria: sent });
  assert.equal(criteriaInSignedTerms(sent, content), true, 'brackets are sanitised the same way on both sides');
});

test('with a ProofRun spec line, that exact line is the agreement and the prose is advisory', () => {
  const spec = `pokter-proofrun/1 spec=0x${'ab'.repeat(32)}`;
  const sent = [spec, 'hf: health factor within 0.01'];
  const tidied = envelope({ deliverables: 'x', quality_standards: 'y', success_criteria: [spec, 'hf:  health factor within 0.01 '] });
  assert.equal(criteriaInSignedTerms(sent, tidied.content), true, 'prose whitespace changed, spec line intact');
  const otherSpec = envelope({ deliverables: 'x', quality_standards: 'y', success_criteria: [`pokter-proofrun/1 spec=0x${'cd'.repeat(32)}`, sent[1]] });
  assert.equal(criteriaInSignedTerms(sent, otherSpec.content), false, 'a different spec hash is not this agreement');
  const otherVersion = envelope({ deliverables: 'x', quality_standards: 'y', success_criteria: [spec.replace('/1 ', '/2 '), sent[1]] });
  assert.equal(criteriaInSignedTerms(sent, otherVersion.content), false, 'not a prefix match');
});
