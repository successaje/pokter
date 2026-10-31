import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { checkDeliveredPlan, PLAN_KINDS, type PlanCheckOutcome, type PlanCheckReport } from '../src/lib/delivery/plan-checks';

/*
 * Checks on a delivered answer: real deliveries from Pokter's agents and one
 * outside grid agent, each run as delivered and then altered one fact at a
 * time. A check has to pass what is right, fail what is wrong, and never
 * pass what is missing.
 */

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const briefs = JSON.parse(fixture('deliveries/briefs.json')) as Record<string, string>;
const delivery = (name: string) => fixture(`deliveries/${name}.json`);

/** Removes a field, where a patch would otherwise set it. */
const REMOVE = Symbol('remove');

/**
 * The manifest with fields of its answer replaced, by dotted path ("grid.buy_orders.2.price"),
 * the way a delivery wrong in exactly that respect would read.
 */
function altered(manifestText: string, patch: Record<string, unknown>): string {
  const manifest = JSON.parse(manifestText) as { response: { content: string } };
  const answer = JSON.parse(manifest.response.content) as Record<string, unknown>;
  for (const [path, value] of Object.entries(patch)) {
    const keys = path.split('.');
    const last = keys.pop()!;
    const parent = keys.reduce<Record<string, unknown>>((node, key) => node[key] as Record<string, unknown>, answer);
    if (value === REMOVE) delete parent[last];
    else parent[last] = value;
  }
  manifest.response.content = JSON.stringify(answer);
  return JSON.stringify(manifest);
}

const outcomes = (report: PlanCheckReport | null) => Object.fromEntries((report?.checks ?? []).map((c) => [c.id, c.outcome])) as Record<string, PlanCheckOutcome>;
const run = (name: string, patch?: Record<string, unknown>, brief: string | null = briefs[name] ?? null) => checkDeliveredPlan(patch ? altered(delivery(name), patch) : delivery(name), brief);

test('each kind of answer is recognised by its shape, with a versioned method', () => {
  assert.equal(run('brinkwatch-56-57031')?.kind, 'health');
  assert.equal(run('centreline-97-1496')?.kind, 'range');
  assert.equal(run('gridloom-97-1490')?.kind, 'grid');
  assert.equal(run('cresthold-97-1493')?.kind, 'yield');
  assert.equal(run('touchstone-56-57052')?.kind, 'token');
  assert.equal(checkDeliveredPlan(fixture('brainonbnb-56-57016.json'))?.kind, 'grid', 'an outside agent’s grid, in its own shape');
  for (const { method } of PLAN_KINDS) assert.match(method, /^[a-z-]+@\d+$/);
  // An answer of a kind with no entry gets the basics only, and says its substance was not checked.
  const research = checkDeliveredPlan(fixture('deliverable-1585.json'));
  assert.equal(research?.kind, null);
  assert.deepEqual(Object.keys(outcomes(research)), ['answer.dated', 'answer.sources']);
  assert.match(research!.notCovered[0], /no check for this kind of answer/);
  assert.equal(checkDeliveredPlan('not json'), null);
});

test('real deliveries from Pokter’s agents pass what they get right and name what they leave out', () => {
  assert.deepEqual(outcomes(run('brinkwatch-56-57031')), {
    'health.subject': 'passed', 'health.totals': 'passed', 'health.follows': 'passed', 'health.liquidatable': 'passed',
    'health.distance': 'passed', 'health.restore': 'passed', 'answer.dated': 'passed', 'answer.sources': 'passed',
  });
  assert.deepEqual(outcomes(run('gridloom-97-1490')), {
    'grid.terms': 'passed', 'grid.bounds': 'passed', 'grid.spacing': 'passed', 'grid.budget': 'passed', 'grid.fees': 'passed',
    'grid.sides': 'passed', 'grid.inventory': 'not-applicable', 'grid.out-of-range': 'passed', 'grid.order-rules': 'not-applicable',
    'answer.dated': 'passed', 'answer.sources': 'passed',
  });
  assert.deepEqual(outcomes(run('cresthold-97-1493')), {
    'yield.terms': 'passed', 'yield.net': 'passed', 'yield.decision': 'passed',
    'yield.incentives': 'not-verified', // it does not say whether XVS rewards are in its rates
    'answer.dated': 'passed', 'answer.sources': 'passed',
  });
  assert.deepEqual(outcomes(run('centreline-97-1496')), {
    'range.status': 'passed', 'range.ticks': 'passed', 'range.prices': 'passed', 'range.brackets': 'passed', 'range.width': 'passed',
    'range.slippage': 'not-verified', // it sizes a swap without a slippage assumption
    'answer.dated': 'passed', 'answer.sources': 'passed',
  });
  assert.deepEqual(outcomes(run('touchstone-56-57052')), { 'token.subject': 'passed', 'token.verdict': 'passed', 'answer.dated': 'passed', 'answer.sources': 'passed' });
});

test('an outside grid in another shape is held to the same rules, and its omissions are named', () => {
  const o = outcomes(checkDeliveredPlan(fixture('brainonbnb-56-57016.json')));
  for (const id of ['grid.bounds', 'grid.spacing', 'grid.budget', 'grid.fees', 'grid.sides']) assert.equal(o[id], 'passed', id);
  assert.equal(o['grid.inventory'], 'not-verified', 'five sells and no word on the base asset to hold');
  assert.equal(o['grid.out-of-range'], 'not-verified');
  assert.equal(o['answer.dated'], 'failed', 'a production time is not a reading time');
});

test('a grid that is wrong in one respect fails that check', () => {
  const grid = 'gridloom-97-1490';
  assert.equal(outcomes(run(grid, { 'setup.budget_usd': 2500 }))['grid.budget'], 'failed');
  assert.equal(outcomes(run(grid, { 'grid.buy_orders.2.price': 2000 }))['grid.spacing'], 'failed');
  assert.equal(outcomes(run(grid, { 'grid.buy_orders.4.price': 2210 }))['grid.bounds'], 'failed');
  assert.equal(outcomes(run(grid, { 'economics.pool_fee_pct': 3 }))['grid.fees'], 'failed', 'a 5.1% step cannot clear two 3% fees');
  assert.equal(outcomes(run(grid, { 'economics.net_per_round_trip_pct': 5.2 }))['grid.fees'], 'failed', 'a net it does not add up to');
  assert.equal(outcomes(run(grid, { price_now: 1900 }))['grid.sides'], 'failed', 'buys above the price fill at once');
  assert.equal(outcomes(run(grid, { 'economics.if_price_falls_below_range': 'Every buy fills and you hold 1.3 ETH.' }))['grid.out-of-range'], 'failed');
  // The buyer's terms: the budget read as a price bound is the failure this is for.
  assert.equal(outcomes(run(grid, undefined, briefs[grid].replace('"budget_usdt":2000', '"budget_usdt":1800')))['grid.terms'], 'failed');
});

test('a grid that leaves something out is not verified there, never passed', () => {
  const grid = 'gridloom-97-1490';
  assert.equal(outcomes(run(grid, { 'economics.pool_fee_pct': REMOVE }))['grid.fees'], 'not-verified');
  assert.equal(outcomes(run(grid, { price_now: REMOVE }))['grid.sides'], 'not-verified');
  assert.equal(outcomes(run(grid, { 'economics.if_price_rises_above_range': REMOVE }))['grid.out-of-range'], 'not-verified');
  assert.equal(outcomes(run(grid, undefined, null))['grid.terms'], 'not-verified', 'no brief to hold it to');
  assert.equal(outcomes(run(grid, { as_of: REMOVE }))['answer.dated'], 'failed');
  // A sell needs the base asset: say how much, or it is not verified.
  const withSells = run(grid, {
    price_now: 2000,
    'grid.buy_orders': [{ price: 1800, usdt: 400 }, { price: 1892.61, usdt: 400 }, { price: 1989.97, usdt: 400 }],
    'grid.sell_orders': [{ price: 2092.35, ETH: 0.2 }, { price: 2200, ETH: 0.2 }],
    'setup.budget_usd': 3 * 400 + 2 * 0.2 * 2000,
    'setup.swap_first': 'Buy about 0.4 ETH now to stock the sell orders.',
  });
  assert.equal(outcomes(withSells)['grid.inventory'], 'passed');
  assert.equal(outcomes(withSells)['grid.sides'], 'passed');
});

test('a yield comparison is held to its arithmetic, its decision and the brief', () => {
  const y = 'cresthold-97-1493';
  assert.equal(outcomes(run(y, { 'venues.1.net_apr_pct': 3.9 }))['yield.net'], 'failed', 'a net rate that ignores its costs');
  assert.equal(outcomes(run(y, { recommend: true }))['yield.decision'], 'failed', 'moving when nothing clears the threshold');
  assert.equal(outcomes(run(y, { 'question.amount': 50000 }))['yield.terms'], 'failed');
  assert.equal(outcomes(run(y, { 'question.asset': 'USDC' }))['yield.terms'], 'failed', 'an answer for a different asset');
  assert.equal(outcomes(run(y, { assumptions: ['Venus Core Pool markets only.', 'XVS rewards are not included.'] }))['yield.incentives'], 'passed');
});

test('a re-centre plan is held to the tick grid and its own prices', () => {
  const r = 'centreline-97-1496';
  assert.equal(outcomes(run(r, { 'positions.0.recentre.ticks.tickLower': -420001 }))['range.ticks'], 'failed', 'a 1% pool only takes multiples of 200');
  assert.equal(outcomes(run(r, { 'positions.0.recentre.new_range.upper': 1 }))['range.prices'], 'failed');
  assert.equal(outcomes(run(r, { 'positions.0.status': 'out-of-range' }))['range.status'], 'failed');
  assert.equal(outcomes(run(r, { 'positions.0.price_now': 1e30 }))['range.brackets'], 'failed');
  assert.equal(outcomes(run(r, { 'positions.0.position': '#7345724 Sue/TEST 0.3%' }))['range.ticks'], 'not-verified', 'an unknown fee tier is not a pass');
});

test('a health report is held to its markets, its thresholds and the wallet named', () => {
  const h = 'brinkwatch-56-57031';
  assert.equal(outcomes(run(h, { health_factor: 1.5 }))['health.follows'], 'failed');
  assert.equal(outcomes(run(h, { liquidatable: true }))['health.liquidatable'], 'failed');
  assert.equal(outcomes(run(h, { 'liquidation.all_collateral_drop_pct': 40 }))['health.distance'], 'failed');
  assert.equal(outcomes(run(h, { 'restore.repay_usd': 50 }))['health.restore'], 'failed');
  assert.equal(outcomes(run(h, { debt_usd: 900 }))['health.totals'], 'failed');
  assert.equal(outcomes(run(h, { account: '0x0000000000000000000000000000000000000001' }))['health.subject'], 'failed');
  assert.equal(outcomes(run(h, { 'markets.collateral.BTC.liquidation_threshold': REMOVE }))['health.follows'], 'not-verified');
});

test('a token verdict milder than its own findings fails', () => {
  const t = 'touchstone-56-57052';
  assert.equal(outcomes(run(t, { verdict: 'Safe' }))['token.verdict'], 'failed');
  assert.equal(outcomes(run(t, { 'measured.honeypot': true }))['token.verdict'], 'failed', 'a honeypot always fails');
  assert.equal(outcomes(run(t, undefined, 'Check the token 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'))['token.subject'], 'failed');
});

test('the job page and the profile show the checks on the published text, with the brief only when it may be shown', () => {
  const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const evidence = code('lib/jobs/evidence.ts');
  assert.match(evidence, /checks = checkDeliveredPlan\(shown, briefIsPublic\(funder\) \? indexed\.task : null\);/);
  assert.match(evidence, /const shown = publishableAnswerText\(read\.text, funder, chain\.client\);/, 'checked on the text a reader sees, buyer wallet masked');
  const sample = code('lib/agent/sample-delivery.ts');
  assert.equal(sample.match(/checks: checkDeliveredPlan\(shown, briefIsPublic\(funder\) \? job\.task : null\),/g)?.length, 2);
  const page = code('app/(site)/jobs/[chainId]/[jobId]/page.tsx');
  assert.match(page, /\{e\.checks && \(\s*<DocSection id="checks" title="What Pokter checked in the answer">/);
  assert.match(page, /It does not mean the advice is good/);
  const view = code('features/delivery/PlanChecks.tsx');
  assert.match(view, /Compared: \{c\.tested\}/, 'every result says what it compared');
  assert.match(view, /Not checked here/);
});
