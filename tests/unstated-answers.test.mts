import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { readinessRows, type ReadinessInput } from '../src/lib/agents/readiness';
import { CATEGORY_SUITE_IDS, GRADING_RULES, judgeStaticAnswer, setAsideUnstated, STATIC_SUITES, statesAnyOutput } from '../src/lib/assay/category-suites';
import { answerComparison } from '../src/lib/assay/comparison';
import { HF_SUITE_ID } from '../src/lib/assay/health-factor';
import type { AssayRun } from '../src/lib/assay/types';
import { checkReading } from '../src/lib/compare/rows';

/*
 * An answer that states none of what a check compares is not graded.
 *
 * The yield briefs fix only the buyer's own terms. An agent that answered
 * with a venue and a net rate, without repeating the amount and horizon it
 * was given, was failed on every scenario and shown as "0 of 3 passed".
 * Leaving out what it was never asked to repeat is not a wrong answer.
 */

const YIELD = { amount: 1000, asset: 'USDT', holding_days: 30, current_apr_pct: 0, threshold_pp: 0.5 };
const answer = (data: Record<string, unknown>) => ({ text: null, data });

test('an answer stating none of the compared terms is not graded, and is told why', () => {
  const verdict = judgeStaticAnswer(YIELD, answer({ venue: 'Venus', net_apr_pct: 4.1, recommend: true }));
  assert.equal(verdict.pass, false);
  assert.equal(verdict.stated, false);
  assert.match(verdict.reason, /states none of what this check compares \(amount, asset, holding days, current apr pct, threshold pp\), so it was not graded/);
});

test('an answer stating some of them is graded on all, and a changed term still fails', () => {
  const changed = judgeStaticAnswer(YIELD, answer({ amount: 1000, asset: 'USDC', holding_days: 30, current_apr_pct: 0, threshold_pp: 0.5 }));
  assert.equal(changed.stated, true);
  assert.equal(changed.pass, false);
  assert.match(changed.reason, /asset should be USDT; answered USDC/, 'the failure this check is for');
  const partial = judgeStaticAnswer(YIELD, answer({ amount: 1000 }));
  assert.equal(partial.stated, true);
  assert.match(partial.reason, /does not state asset/);
  const echoed = judgeStaticAnswer(YIELD, answer({ ...YIELD, venue: 'Venus' }));
  assert.equal(echoed.pass, true);
  assert.equal(echoed.stated, true);
});

test('an unreadable reply is still unreadable, not "not stated"', () => {
  const verdict = judgeStaticAnswer(YIELD, { text: 'The best yield is on Venus.', data: null });
  assert.equal(verdict.observed, null);
  assert.equal(verdict.stated, false);
  assert.match(verdict.reason, /No JSON object/);
});

test('stating any one output counts; nulls and absences do not', () => {
  assert.equal(statesAnyOutput(YIELD, {}), false);
  assert.equal(statesAnyOutput(YIELD, { amount: null }), false);
  assert.equal(statesAnyOutput(YIELD, { asset: 'USDT' }), true);
  assert.equal(statesAnyOutput(YIELD, null), false);
});

/* A run as one was recorded before the rule: every answer failed as "does not state amount". */
const recorded: AssayRun = {
  suite: CATEGORY_SUITE_IDS.yield,
  status: 'checked',
  detail: null,
  passed: 0,
  total: 3,
  ranAt: '2026-10-28T13:39:00.000Z',
  via: 'free-call',
  rules: 1,
  results: STATIC_SUITES.yield.scenarios.map((scenario) => ({
    scenario: scenario.id,
    expected: scenario.expected,
    observed: {},
    excerpt: '{"venue":"Venus","net_apr_pct":4.1}',
    pass: false,
    outcome: 'wrong',
    reason: 'The answer does not state amount; the scenario expects 1000.',
    latencyMs: 300,
  })),
};

test('a run recorded before the rule reads with it: nothing graded, nothing failed', () => {
  const read = setAsideUnstated(recorded);
  assert.equal(read.total, 0);
  assert.equal(read.passed, 0);
  assert.ok(read.results.every((r) => r.outcome === 'not-stated'));
  assert.match(read.detail ?? '', /no answer stated any of what this check compares, so none could be graded/);
  assert.deepEqual(setAsideUnstated(read), read, 'reading it again changes nothing');
});

test('only answers that state nothing are set aside, and only on scenario checks', () => {
  const [first, ...rest] = recorded.results;
  const mixed: AssayRun = { ...recorded, results: [{ ...first, observed: { amount: 1000 }, reason: 'The answer does not state asset; the scenario expects USDT.' }, ...rest] };
  const read = setAsideUnstated(mixed);
  assert.equal(read.total, 1, 'the one that stated the amount is still graded');
  assert.equal(read.results[0].outcome, 'wrong');
  assert.match(read.detail ?? '', /2 of 3 answers stated none of what this check compares/);
  assert.equal(setAsideUnstated({ ...recorded, suite: HF_SUITE_ID }).total, 3, 'a live check is not touched');
  assert.equal(setAsideUnstated({ ...recorded, status: 'paid-only' }).total, 3);
});

test('the comparison says nothing was graded, labels each row, and shows the reply', () => {
  const comparison = answerComparison(setAsideUnstated(recorded))!;
  assert.equal(comparison.summary.tone, 'none', 'not the red of a failure');
  assert.match(comparison.summary.text, /none could be graded/);
  assert.match(comparison.scope, /says nothing either way/);
  for (const row of comparison.rows) {
    assert.equal(row.result.label, 'Not graded');
    assert.equal(row.difference, '—', 'absences are not a difference');
    assert.equal(row.reply, '{"venue":"Venus","net_apr_pct":4.1}');
  }
});

test('beside graded answers, the ones set aside are counted apart', () => {
  const [first, ...rest] = recorded.results;
  const run: AssayRun = { ...recorded, passed: 1, results: [{ ...first, observed: YIELD, pass: true, outcome: 'correct' }, ...rest] };
  const comparison = answerComparison(setAsideUnstated(run))!;
  assert.equal(comparison.summary.text, 'Matched 1 of 1 published scenario; 2 more not graded, stating none of what the check compares.');
  assert.equal(comparison.summary.tone, 'ok');
});

test('the agent page and Compare say "not graded", never "0 of 3 passed"', () => {
  const input: ReadinessInput = {
    now: Date.parse('2026-10-29T08:00:00Z'),
    live: { answered: true, medianMs: 300 },
    record: { totalProbes: 450, totalAnswered: 446, observedDays: 30, lastSeen: null },
    quote: null,
    escrowLabel: 'BNB Chain',
    history: { jobs: 0, selfDelivered: 0, operatorDelivered: 0, relayedDelivered: 0 },
    categoryCheck: { name: STATIC_SUITES.yield.label, run: setAsideUnstated(recorded) },
  };
  const row = readinessRows(input).find((r) => r.id === 'correctness')!;
  assert.equal(row.label, 'Answer check');
  assert.equal(row.value, 'Not graded');
  assert.equal(row.tone, 'unknown');
  assert.match(row.detail, /^Yield brief terms read back, 18 h ago\. Answered, but no answer stated/);
  assert.equal(checkReading({ passed: 0, total: 0, status: 'checked', via: 'free-call' }).text, 'Answered, but none of it could be graded');
});

test('the yield check is named for what it checks, and the rule change regrades paid runs', () => {
  assert.equal(STATIC_SUITES.yield.label, 'Yield brief terms read back');
  assert.equal(GRADING_RULES, 2);
});

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('new runs leave unstated answers out of the total, free and paid alike, and old runs are read the same way', () => {
  assert.match(source('src/lib/assay/static-run.ts'), /total: results\.filter\(\(result\) => !NOT_COUNTED\.has\(result\.outcome\)\)\.length/);
  assert.match(source('src/lib/assay/static-run.ts'), /verdict\.observed && !verdict\.stated \? 'not-stated'/);
  assert.match(source('src/lib/assay/paid-grade.ts'), /verdict\.stated \? 'wrong' : 'not-stated'/);
  assert.match(source('src/lib/assay/paid-run.ts'), /const scored = resolved\.filter\(\(result\) => !NOT_COUNTED\.has\(result\.outcome\)\)/);
  assert.match(source('src/lib/assay/store.ts'), /return setAsideUnstated\(loaded\);/);
});
