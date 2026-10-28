import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { STATIC_SUITES } from '../src/lib/assay/category-suites';
import { answerComparison } from '../src/lib/assay/comparison';
import type { AssayRun } from '../src/lib/assay/types';

/*
 * A graded check reads as a comparison: Pokter's reference, the agent's
 * answer, the difference and the result, with the network, the reference
 * block, the tolerance and when it was checked. A matched check covers the
 * scenarios it lists, and says so.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const RAN = '2026-10-28T16:18:00.000Z';
const run = (suite: string, results: AssayRun['results'], extra: Partial<AssayRun> = {}): AssayRun => ({
  suite, status: 'checked', detail: null, passed: results.filter((r) => r.pass).length, total: results.length, ranAt: RAN, via: 'paid-hire', results, ...extra,
});
const result = (scenario: string, expected: unknown, observed: unknown, pass: boolean, outcome: string, jobId: string | null = '57090') =>
  ({ scenario, expected, observed, excerpt: null, pass, outcome, reason: 'why', latencyMs: null, jobId });

test('a health factor row compares Pokter’s reading with the answer, by how far apart they are', () => {
  const account = '0x0aee98f6317ad64472330ca09af6c076bee99ab7';
  const c = answerComparison(run('hf-venus-1', [
    result(account, { healthFactor: 1.5, borrowLimitRatio: 1.3, liquidatable: false, block: '127900000', readAt: '2026-10-28T16:10:00.000Z' }, { healthFactor: 1.503, unbounded: false, liquidatable: false }, true, 'correct'),
    result('0x000000000000000000000000000000000000dead', { before: { healthFactor: null, block: '127000000' }, after: { healthFactor: null } }, { healthFactor: null, unbounded: true, liquidatable: false }, true, 'correct', null),
  ]))!;
  assert.equal(c.kind, 'health-factor');
  assert.equal(c.network, 'BNB Chain');
  assert.match(c.tolerance, /^Within 2% of Pokter’s reading, taken within 15 minutes of the delivery$/);
  assert.deepEqual(
    c.rows.map((r) => [r.reference, r.answer, r.difference, r.result.label, r.block, r.readAt, r.jobId, r.account]),
    [
      ['1.500', '1.503', '0.2%', 'Matches Venus', '127900000', '2026-10-28T16:10:00.000Z', '57090', account],
      ['No debt', 'No debt', 'None', 'Matches Venus', '127000000', RAN, null, '0x000000000000000000000000000000000000dead'],
    ],
  );
  assert.equal(c.summary.text, 'Matched Venus on 2 of 2 live positions.');
});

test('a reading taken before and after a direct reply is shown once when it did not move, and both when it did', () => {
  const both = (before: number, after: number) => answerComparison(run('hf-venus-1', [result('0x62fe00000000000000000000000000000000887b', { before: { healthFactor: before }, after: { healthFactor: after } }, { healthFactor: after, unbounded: false, liquidatable: false }, true, 'correct')], { via: 'free-call' }))!.rows[0];
  assert.equal(both(5.769, 5.769).reference, '5.769');
  assert.equal(both(1.2, 1.25).reference, '1.200 before · 1.250 after');
  assert.equal(both(1.2, 1.25).difference, '0.00%', 'the closest reading counts, as the grader does');
});

test('a position row names the status each side gave and the block Pokter read, or says the block was not recorded', () => {
  const c = answerComparison(run('v3-range-1', [
    result('#7674122', { status: 'in-range', block: '127912345', readAt: RAN }, { status: 'in-range' }, true, 'correct'),
    result('#7674188', { status: 'out-of-range' }, { status: 'in-range' }, false, 'wrong'),
    result('#7674190', { status: 'closed', block: '127912345' }, null, false, 'unanswered'),
  ]))!;
  assert.equal(c.kind, 'position-range');
  assert.deepEqual(c.rows.map((r) => [r.reference, r.answer, r.difference, r.result.label, r.block]), [
    ['In range', 'In range', 'None', 'Matched', '127912345'],
    ['Out of range', 'In range', 'Differs', 'Did not match', null],
    ['Closed', '—', '—', 'Not mentioned', '127912345'],
  ]);
});

test('a scenario row compares each field the brief fixes, within the grader’s tolerance, and names the brief', () => {
  const suite = STATIC_SUITES['grid-trading'];
  const scenario = suite.scenarios[0];
  const expected = scenario.expected as Record<string, number | string>;
  const close = Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, typeof v === 'number' ? v + Math.max(0.01, Math.abs(v) * 0.005) / 2 : v]));
  const off = { ...expected, levels: Number(expected.levels) + 1, pair: 'ETH/USDT' };
  const c = answerComparison(run(suite.id, [result(scenario.id, expected, close, true, 'correct'), result(`${scenario.id}-b`, expected, off, false, 'wrong'), result('missing', expected, null, false, 'unreadable')]))!;
  assert.equal(c.kind, 'scenario');
  assert.equal(c.rows[0].task, scenario.brief.text);
  assert.equal(c.rows[0].difference, 'None', 'inside the tolerance is no difference');
  assert.equal(c.rows[1].difference, 'pair differs · levels +1');
  assert.equal(c.rows[2].difference, '—');
  assert.equal(c.rows[0].block, null);
  assert.equal(c.tolerance, 'Numbers within 0.5% (at least 0.01); words exactly');
});

test('a passed check says what it covers, and a run with nothing to compare has no comparison', () => {
  const c = answerComparison(run('v3-range-1', [result('#1', { status: 'in-range' }, { status: 'in-range' }, true, 'correct')]))!;
  assert.equal(c.scope, 'This covers the 1 position listed, when they were graded. It does not show the agent is right on every question.');
  assert.equal(answerComparison(null), null);
  assert.equal(answerComparison(run('v3-range-1', [], { status: 'paid-only' })), null);
  assert.equal(answerComparison(run('v3-range-1', [])), null);
  const unscored = answerComparison(run('v3-range-1', [result('#1', { status: 'in-range' }, null, false, 'not-comparable')]))!;
  assert.equal(unscored.rows[0].result.label, 'Not comparable', 'set aside, not accused of a wrong answer');
});

test('the agent page shows the result in two lines and the full comparison one click away', () => {
  const page = code('app/(site)/agents/[chainId]/[tokenId]/page.tsx');
  assert.match(page, /const checkComparison = answerComparison\(p\.categoryCheck\?\.run \?\? null\);/);
  assert.match(page, /\{checkComparison && <AnswerCheckSummary label=\{p\.categoryCheck!\.definition\.label\} comparison=\{checkComparison\} \/>\}/);
  assert.match(page, /<div id="answer-check" className="scroll-mt-32">/);
  assert.match(code('features/agent/AgentTabs.tsx'), /'answer-check': 'evidence'/, 'the link opens the Evidence tab');
  assert.match(code('features/agent/AnswerComparison.tsx'), /<a href="#answer-check"/);
  assert.match(code('features/agent/CategoryCheck.tsx'), /<AnswerComparison comparison=\{comparison\} agentKey=\{agentKey\} \/>/);
});

test('paid checks record the block Pokter read the reference at', () => {
  assert.match(code('lib/assay/paid-run.ts'), /liquidatable: reading\.liquidatable, block: reading\.block\.toString\(\) \}/);
  const v3 = code('lib/assay/v3-grade.ts');
  assert.match(v3, /const at = \{ block: input\.reading\.block\.toString\(\), readAt: input\.readAt \};/);
  assert.equal(v3.match(/\.\.\.at \}/g)?.length, 6, 'every row that names Pokter’s reading');
});
