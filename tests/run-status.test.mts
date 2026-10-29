import assert from 'node:assert/strict';
import test from 'node:test';

import { freeRunStatus } from '../src/lib/assay/run-status';
import { judgeStaticAnswer } from '../src/lib/assay/category-suites';

const unanswered = (reason: string) => ({ scenario: 's', expected: {}, observed: null, excerpt: null, pass: false, outcome: 'unreadable', reason: `No answer: ${reason}`, latencyMs: null });

test('a run with no answer to grade is not published as failing', () => {
  // As recorded for one operator's grid planner: every brief refused before any work.
  const refused = [1, 2, 3].map(() => unanswered("The agent returned an error: unknown skill \"grid_plan\"."));
  const status = freeRunStatus(refused as never);
  assert.equal(status.status, 'not-askable');
  assert.match(status.detail ?? '', /unknown skill/);
});

test('one readable answer, right or wrong, makes it a check', () => {
  const mixed = [unanswered('timeout'), { ...unanswered('x'), observed: { verdict: 'PASS' }, excerpt: '{"verdict":"PASS"}', outcome: 'wrong', reason: 'verdict should be FAIL' }];
  assert.equal(freeRunStatus(mixed as never).status, 'checked');
});

test('a missing field is reported as not stated, not as "undefined"', () => {
  const verdict = judgeStaticAnswer({ amount: 5000, asset: 'USDT' }, { text: null, data: { amount: 5000, recommend: false } });
  assert.equal(verdict.pass, false);
  assert.equal(verdict.stated, true, 'it states the amount, so it is graded on both');
  assert.match(verdict.reason, /does not state asset; the scenario expects USDT/);
});
