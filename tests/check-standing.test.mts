import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { deriveMaturity, LADDER_MEANING, type MaturityFacts } from '../src/lib/agents/maturity';
import { assayForCategory } from '../src/lib/assay/catalog';
import { answerComparison } from '../src/lib/assay/comparison';
import { STATIC_SUITES } from '../src/lib/assay/category-suites';
import { CHECK_FRESH_DAYS, checkStanding, passedCheck } from '../src/lib/assay/standing';
import type { AssayRun } from '../src/lib/assay/types';
import { checkReading, checkTone } from '../src/lib/compare/rows';

/*
 * A pass of one named check, on one date, that stops counting after
 * CHECK_FRESH_DAYS: the same rule wherever "Checked" is earned.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-31T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

const grid = STATIC_SUITES['grid-trading'];
const run = (overrides: Partial<AssayRun> = {}): AssayRun => ({
  suite: grid.id,
  status: 'checked',
  detail: null,
  passed: 3,
  total: 3,
  ranAt: daysAgo(2),
  via: 'free-call',
  results: grid.scenarios.map((s) => ({ scenario: s.id, expected: s.expected, observed: s.expected, excerpt: null, pass: true, outcome: 'correct', reason: '', latencyMs: 10 })),
  ...overrides,
});

function facts(overrides: Partial<MaturityFacts> = {}): MaturityFacts {
  return {
    registered: true,
    reachable: true,
    compatible: true,
    tested: false,
    hired: false,
    delivered: false,
    deliveredByOperator: false,
    deliveredViaPokter: false,
    outsideTeam: { jobs: 0, completed: 0, terminal: 0, uniqueBuyers: 0, completionRate: null },
    probeRate: 1,
    observedDays: 10,
    now: NOW,
    ...overrides,
  };
}

const definition = assayForCategory('grid-trading')!;
const ladder = (r: AssayRun) => deriveMaturity(facts({ tested: passedCheck(r, NOW), check: { label: definition.label, scope: definition.scope, run: r } }));

test('a pass counts for 30 days, and a failure stays a failure at any age', () => {
  assert.equal(CHECK_FRESH_DAYS, 30);
  assert.equal(checkStanding(run({ ranAt: daysAgo(29) }), NOW), 'passed');
  assert.equal(checkStanding(run({ ranAt: daysAgo(31) }), NOW), 'stale');
  assert.equal(checkStanding(run({ passed: 2, ranAt: daysAgo(90) }), NOW), 'failed');
  assert.equal(checkStanding(run({ status: 'paid-only', total: 3, passed: 0 }), NOW), 'ungraded');
  assert.equal(checkStanding(run({ total: 0, passed: 0 }), NOW), 'ungraded');
  assert.equal(checkStanding(null, NOW), 'not-run');
  assert.equal(passedCheck(run({ ranAt: daysAgo(31) }), NOW), false);
});

test('every check has a short scope for a label to name it by', () => {
  for (const category of ['health-factor', 'rebalancing', 'grid-trading', 'yield', 'token-safety'] as const) {
    const scope = assayForCategory(category)!.scope;
    assert.ok(scope.length > 3 && scope.length <= 16 && scope === scope.toLowerCase(), `${category}: ${scope}`);
  }
});

test('"Checked" names the check and the date, in the label and the step', () => {
  const maturity = ladder(run());
  assert.equal(maturity.current, 'checked');
  assert.equal(maturity.label, 'Checked: grid plan, 29 Oct');
  assert.equal(maturity.badge, 'Checked');
  const step = maturity.steps.find((s) => s.id === 'checked')!;
  assert.equal(step.state, 'earned');
  assert.equal(step.detail, 'Grid plan: 3 of 3 matched when asked directly, 29 Oct.');
  assert.equal(maturity.summary, step.detail);
  assert.match(LADDER_MEANING.checked, /in the last 30 days/);
});

test('a pass over 30 days old is shown, as partial, and earns nothing', () => {
  const maturity = ladder(run({ ranAt: '2026-08-20T09:00:00Z', via: 'paid-hire' }));
  assert.equal(maturity.current, 'priced');
  const step = maturity.steps.find((s) => s.id === 'checked')!;
  assert.equal(step.state, 'partial');
  assert.equal(step.earned, false);
  assert.equal(step.detail, 'Grid plan: 3 of 3 matched in paid work, 20 Aug 2026: over 30 days ago, so it no longer counts.');
});

test('a failed check says how much matched, and when', () => {
  const step = ladder(run({ passed: 2 })).steps.find((s) => s.id === 'checked')!;
  assert.equal(step.state, 'unmet');
  assert.equal(step.detail, 'Grid plan: 2 of 3 matched when asked directly, 29 Oct.');
});

test('a lapsed pass loses its green in the comparison, and keeps its rows', () => {
  const fresh = answerComparison(run(), NOW)!;
  assert.equal(fresh.summary.tone, 'ok');
  const stale = answerComparison(run({ ranAt: daysAgo(45) }), NOW)!;
  assert.equal(stale.summary.tone, 'watch');
  assert.match(stale.summary.text, /^Matched 3 of 3 published scenarios\. That was over 30 days ago, so it no longer counts until it is graded again\.$/);
  assert.equal(stale.rows.length, 3);
});

test('Compare shows a lapsed pass with its age, unmarked and unranked', () => {
  const lapsed = { passed: 3, total: 3, status: 'checked', via: 'free-call', ranAt: daysAgo(40) };
  assert.deepEqual(checkReading(lapsed, NOW), { text: '3 of 3 passed, over 30 days ago', score: null });
  assert.equal(checkTone(lapsed, NOW), 'none');
  assert.equal(checkTone({ ...lapsed, ranAt: daysAgo(1) }, NOW), 'pass');
  assert.equal(checkTone({ ...lapsed, passed: 1 }, NOW), 'fail');
});

test('Compare ranks the answer check only among agents that took the same one, and offers Hire only to agents that answered', () => {
  const view = code('features/compare/CompareView.tsx');
  assert.match(view, /rank: \{ of: \(c, all\) => \(all\.every\(\(o\) => o\.category === c\.category\) \? checkReading\(c\.check\)\.score : null\)/);
  assert.match(view, /if \(c\.record\.totalProbes > 0 && c\.record\.totalAnswered === 0\) \{/);
  assert.equal(view.match(/<HireAction c=\{c\}/g)?.length, 2, 'both layouts');
  assert.doesNotMatch(view.slice(view.indexOf('export function CompareView')), /href=\{`\/hire\//, 'no Hire link outside HireAction');
});

test('one rule earns "Checked" everywhere', () => {
  for (const path of ['lib/marketplace.ts', 'lib/agents/dossier-ladder.ts', 'features/studio/data.ts']) {
    const source = code(path);
    assert.match(source, /passedCheck\(/, path);
    assert.doesNotMatch(source, /\.passed === [a-zA-Z.?]*\.total/, `${path} keeps no copy of its own`);
  }
  assert.match(code('lib/builders/growth.ts'), /checkStanding\(run, now\)/);
  assert.match(code('features/discover/FilterBar.tsx'), /in the last \$\{CHECK_FRESH_DAYS\} days/);
});

test('health factor and position runs record the rules that graded them', () => {
  assert.match(code('lib/assay/run.ts'), /via: 'free-call' as const, rules: HF_GRADING_RULES \}/);
  const paid = code('lib/assay/paid-run.ts');
  assert.match(paid, /results: graded,\n\s*rules: HF_GRADING_RULES,/);
  assert.match(paid, /results: graded,\n\s*rules: V3_GRADING_RULES,/);
});

test('the position check no longer claims to catch invented positions', () => {
  const limitation = assayForCategory('rebalancing')!.limitation;
  assert.doesNotMatch(limitation, /none is invented/);
  assert.match(limitation, /caught only in a wallet that holds none/);
  assert.doesNotMatch(code('app/(site)/methodology/page.tsx'), /none invented or left out/);
});
