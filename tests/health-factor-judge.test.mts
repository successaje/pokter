import assert from 'node:assert/strict';
import test from 'node:test';

import { judgeHf, readHfAnswer, type HfExpected } from '../src/lib/assay/health-factor';
import { gradePaidHfScenario } from '../src/lib/assay/paid-hf-grade';

const NO_DEBT: HfExpected = { healthFactor: null, liquidatable: false };
const HEALTHY: HfExpected = { healthFactor: 1.5, liquidatable: false };
const UNDER: HfExpected = { healthFactor: 0.97, liquidatable: true };
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const read = (data: Record<string, unknown>) => readHfAnswer({ text: null, data });

test('no debt cannot be liquidatable (the false pass an outside review reproduced)', () => {
  assert.equal(judgeHf([NO_DEBT], read({ health_factor: null, liquidatable: true })).pass, false);
  assert.equal(judgeHf([NO_DEBT], read({ health_factor: null, liquidatable: false })).pass, true);
  assert.equal(judgeHf([NO_DEBT], read({ health_factor: null })).reason, 'Correct: no debt; liquidation not stated.');
  assert.equal(judgeHf([NO_DEBT], read({ health_factor: 2.1 })).pass, false);
});

test('an answer about another account fails, whatever its numbers', () => {
  const other = read({ account: '0x2222222222222222222222222222222222222222', health_factor: 1.5, liquidatable: false });
  const verdict = judgeHf([HEALTHY], other, { expectedAccount: ACCOUNT });
  assert.equal(verdict.pass, false);
  assert.match(verdict.reason, /not the account asked about/);
  assert.equal(judgeHf([HEALTHY], read({ account: ACCOUNT, health_factor: 1.5, liquidatable: false }), { expectedAccount: ACCOUNT }).pass, true);
});

test('a malformed liquidation flag fails rather than counting as unstated', () => {
  for (const flag of ['maybe', 1, { value: true }]) {
    const verdict = judgeHf([HEALTHY], read({ health_factor: 1.5, liquidatable: flag }));
    assert.equal(verdict.pass, false, JSON.stringify(flag));
    assert.match(verdict.reason, /not a yes or no/);
  }
});

test('near the boundary and under water: the number and the flag must both be right', () => {
  // Within 2% of 0.97, and correctly liquidatable.
  assert.equal(judgeHf([UNDER], read({ health_factor: 0.96, liquidatable: true })).pass, true);
  // Right number, wrong flag.
  assert.equal(judgeHf([UNDER], read({ health_factor: 0.97, liquidatable: false })).pass, false);
  // A healthy position called liquidatable.
  assert.equal(judgeHf([HEALTHY], read({ health_factor: 1.5, liquidatable: true })).pass, false);
  // Just outside tolerance.
  assert.equal(judgeHf([{ healthFactor: 1.0, liquidatable: false }], read({ health_factor: 1.025, liquidatable: false })).pass, false);
});

test('a paid pass says what it was compared with', () => {
  const manifest = JSON.stringify({ response: { content: JSON.stringify({ health_factor: 1.5, liquidatable: false, as_of: { time: '2026-10-15T10:00:00Z' } }) } });
  const result = gradePaidHfScenario({ account: ACCOUNT, jobId: '1', manifestText: manifest, reading: HEALTHY, readAt: '2026-10-15T10:40:00Z' });
  assert.equal(result.pass, true);
  assert.match(result.reason, /40 minutes after the agent’s: consistent with the position, not proof it was exact/);
});
