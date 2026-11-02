import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { checkDeliveredPlan } from '../src/lib/delivery/plan-checks';
import { PLAN_PROOF_PREFIX, planProofCoverage, planProofSpec, planProofTerms } from '../src/lib/delivery/plan-proof';
import { criteriaInSignedTerms } from '../src/lib/erc8183/negotiation';
import { hireCriteria, hirePlanProofSpec } from '../src/lib/proofrun/hire-criteria';
import { specHashFromCriteria } from '../src/lib/proofrun/acceptance';
import { agreementVerdict } from '../src/lib/proofrun/agreement';

const delivery = (name: string) => readFileSync(new URL(`./fixtures/deliveries/${name}.json`, import.meta.url), 'utf8');

test('grid and yield quotes name the checker that runs on real delivered shapes', () => {
  for (const [category, kind, fixture] of [
    ['Grid Trading', 'grid', 'gridloom-97-1490'],
    ['Yield Optimisation', 'yield', 'cresthold-97-1493'],
  ] as const) {
    const spec = hirePlanProofSpec({ category });
    assert.equal(spec?.kind, kind);
    assert.deepEqual(hireCriteria({ category, brief: 'Compare this plan' }), planProofTerms(kind));
    assert.equal(specHashFromCriteria(planProofTerms(kind)), spec?.specHash);
    const report = checkDeliveredPlan(delivery(fixture));
    assert.equal(report?.method, spec?.method);
    assert.deepEqual(planProofCoverage(spec!, report), { matched: true, missing: [] });
  }
});

test('a missing or different checker never satisfies a signed plan', () => {
  const grid = planProofSpec('grid');
  const delivered = checkDeliveredPlan(delivery('gridloom-97-1490'))!;
  assert.equal(planProofCoverage(grid, checkDeliveredPlan(delivery('cresthold-97-1493'))).matched, false);
  assert.equal(planProofCoverage(grid, { ...delivered, method: 'grid-plan@2' }).matched, false);
  assert.deepEqual(planProofCoverage(grid, { ...delivered, checks: delivered.checks.filter((check) => check.id !== 'grid.fees') }), { matched: false, missing: ['grid.fees'] });
  assert.equal(planProofCoverage(grid, null).matched, false);
});

test('a plan is signed only when the exact hash is in the bound terms for this on-chain job', () => {
  const spec = planProofSpec('yield');
  const terms = planProofTerms('yield');
  const content = { terms: { success_criteria: terms } };
  assert.equal(criteriaInSignedTerms(terms, content), true);
  assert.equal(criteriaInSignedTerms(terms, { terms: { success_criteria: [`${PLAN_PROOF_PREFIX}0x${'0'.repeat(64)}`] } }), false);
  const hash = `0x${'a'.repeat(64)}`;
  const provider = '0x1111111111111111111111111111111111111111';
  const agreement = { negotiationHash: hash, specHash: spec.specHash, sentCriteria: terms, signedCriteria: terms, termsBound: true, task: 'Compare rates', provider, escrowChainId: 97, quotedAt: '2026-11-02T00:00:00.000Z' };
  const job = { negotiationHash: hash, provider, escrowChainId: 97, task: 'Compare rates' };
  assert.equal(agreementVerdict({ agreement, job, spec, specTermPrefix: PLAN_PROOF_PREFIX }).binding.kind, 'signed-terms');
  assert.equal(agreementVerdict({ agreement, job: { ...job, provider: '0x2222222222222222222222222222222222222222' }, spec, specTermPrefix: PLAN_PROOF_PREFIX }).binding.kind, 'pokter-asserted');
  assert.equal(agreementVerdict({ agreement, job, spec: planProofSpec('grid'), specTermPrefix: PLAN_PROOF_PREFIX }).binding.kind, 'pokter-asserted');
});
