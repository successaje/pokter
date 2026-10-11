import assert from 'node:assert/strict';
import test from 'node:test';

import { computeHealthFactor, HF_SCENARIOS, judgeHf, readHfAnswer } from '../src/lib/assay/health-factor';

const expected = Object.fromEntries(HF_SCENARIOS.map((s) => [s.id, computeHealthFactor(s.position)]));

test('the published scenarios have the answers worked out by hand', () => {
  assert.equal(expected['single-healthy'].healthFactor, 1.6);
  assert.ok(Math.abs(expected['multi-asset'].healthFactor! - 1.15) < 1e-12);
  assert.ok(Math.abs(expected['liquidatable'].healthFactor! - 800 / 820) < 1e-12);
  assert.equal(expected['liquidatable'].liquidatable, true);
  assert.deepEqual(expected['no-debt'], { healthFactor: null, liquidatable: false });
  assert.ok(Math.abs(expected['non-collateral-asset'].healthFactor! - 400 / 300) < 1e-12);
});

test('answers are read from data, from JSON in text, and from prose', () => {
  assert.deepEqual(readHfAnswer({ text: null, data: { health_factor: 1.6, liquidatable: false } }), { healthFactor: 1.6, unbounded: false, liquidatable: false });
  assert.deepEqual(readHfAnswer({ text: 'Result: {"healthFactor": "1.15", "isLiquidatable": "no"}', data: null }), { healthFactor: 1.15, unbounded: false, liquidatable: false });
  assert.deepEqual(readHfAnswer({ text: null, data: { result: { hf: 0.9756 } } }), { healthFactor: 0.9756, unbounded: false, liquidatable: null });
  assert.equal(readHfAnswer({ text: 'The health factor is 0.98, so the position can be liquidated.', data: null })?.liquidatable, true);
  assert.equal(readHfAnswer({ text: null, data: { health_factor: null } })?.unbounded, true);
  assert.equal(readHfAnswer({ text: null, data: { health_factor: 'Infinity' } })?.unbounded, true);
  assert.equal(readHfAnswer({ text: 'I monitor Venus positions.', data: null }), null);
});

test('judging: within 1% passes, outside fails, and a wrong liquidation call fails', () => {
  assert.equal(judgeHf(expected['single-healthy'], { healthFactor: 1.605, unbounded: false, liquidatable: false }).pass, true);
  assert.equal(judgeHf(expected['single-healthy'], { healthFactor: 1.7, unbounded: false, liquidatable: false }).pass, false);
  assert.equal(judgeHf(expected['liquidatable'], { healthFactor: 0.976, unbounded: false, liquidatable: false }).pass, false);
  assert.equal(judgeHf(expected['liquidatable'], { healthFactor: 0.976, unbounded: false, liquidatable: null }).pass, true);
});

test('no debt must be answered as no health factor, not as a number', () => {
  assert.equal(judgeHf(expected['no-debt'], { healthFactor: null, unbounded: true, liquidatable: false }).pass, true);
  assert.equal(judgeHf(expected['no-debt'], { healthFactor: 0, unbounded: false, liquidatable: false }).pass, false);
  assert.equal(judgeHf(expected['single-healthy'], null).pass, false);
});

test('counting the non-collateral asset is caught', () => {
  // (1000 + 500) * 0.8 / 300 = 4.0 is the classic mistake; the right answer is 1.333.
  assert.equal(judgeHf(expected['non-collateral-asset'], { healthFactor: 4, unbounded: false, liquidatable: false }).pass, false);
});
