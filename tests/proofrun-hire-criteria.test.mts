import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { hireAcceptanceSpec, hireCriteria } from '../src/lib/proofrun/hire-criteria';
import { isSpecLine, venusAcceptanceSpec } from '../src/lib/proofrun/acceptance';
import { VENUS_CHAIN_ID, venusHealthJob } from '../src/lib/delivery/venus-report-check';
import { VENUS_COMPTROLLER } from '../src/lib/assay/venus';

/*
 * Which hires carry acceptance criteria, and which do not.
 *
 * `/api/hire/quote` has always accepted `successCriteria` and nothing ever
 * sent any, so the field that turns "Pokter recorded these criteria" into
 * "the agent signed them" was reachable and unused. Every hire quoted
 * without one and every receipt read `pokter-asserted`.
 *
 * The rule is borrowed rather than invented: `venusHealthJob` is the same
 * predicate ProofRun uses to decide a delivered job is this check's. A
 * second, similar-looking rule here would eventually disagree with it, and
 * the disagreement would surface as an agent bound to criteria nobody
 * evaluates.
 */

const ACCOUNT = '0xd213846db9fd0b8b282e00EF67dd899dA58250cc';

test('a Venus health-factor brief carries the criteria ProofRun will check', () => {
  const criteria = hireCriteria({ category: null, brief: `Venus health factor for ${ACCOUNT}` });
  assert.ok(criteria, 'a plainly Venus brief carried no criteria');
  assert.ok(criteria.length > 1 && criteria.length <= 8);
  assert.ok(isSpecLine(criteria[0]), 'the spec line is not first, so the binding would not be recognised');

  /* The spec must be the one ProofRun recomputes, or the hash will not match. */
  const spec = hireAcceptanceSpec({ category: null, brief: `Venus health factor for ${ACCOUNT}` });
  const expected = venusAcceptanceSpec({ deployment: VENUS_COMPTROLLER, chainId: VENUS_CHAIN_ID });
  assert.equal(spec!.specHash, expected.specHash, 'the hire spec is not the one the check uses');
});

/*
 * The deployment read is Venus on mainnet whatever chain the escrow is on:
 * a testnet job buys an answer about chain 56, and the spec hash has to say
 * so or it will not match what ProofRun recomputes.
 */
test('the spec names the chain the check reads, not the chain the money is on', () => {
  const spec = hireAcceptanceSpec({ category: 'health-factor', brief: `Check ${ACCOUNT}` });
  assert.ok(spec);
  assert.equal(VENUS_CHAIN_ID, 56);
  assert.match(JSON.stringify(spec), /56/);
});

test('the category alone is enough, as it is at check time', () => {
  /* A brief that never says "Venus" still counts when the envelope's
     category does, because that is what `venusHealthJob` reads back. */
  assert.ok(hireCriteria({ category: 'health-factor', brief: `How close is ${ACCOUNT} to liquidation?` }));
  assert.ok(venusHealthJob({ category: 'health-factor', brief: 'anything' }), 'the borrowed predicate changed');
});

/*
 * Everything else gets nothing, and that is not a refusal. A quote without
 * criteria is ordinary and verifies exactly as before; it costs the
 * binding and nothing else.
 */
test('hires this check does not cover carry nothing', () => {
  for (const [label, input] of [
    ['a yield brief', { category: 'yield', brief: `Best stablecoin yield for ${ACCOUNT}` }],
    ['a token-safety brief', { category: 'token-safety', brief: `Is ${ACCOUNT} safe to buy?` }],
    ['Venus without a health factor', { category: null, brief: `What is Venus's TVL? ${ACCOUNT}` }],
    ['a health factor without Venus', { category: null, brief: `Health factor for ${ACCOUNT} on Lista` }],
  ] as const) {
    assert.equal(hireCriteria(input), undefined, `${label} was bound to Venus criteria`);
  }
});

/*
 * A criterion that cannot be evaluated is not a stricter standard, it is a
 * meaningless one. `binding.account` says the report is about the account
 * the brief named; with none, or with two, ProofRun refuses the job with
 * `no-subject` or `ambiguous-subject` and the criteria are never checked.
 */
test('a brief with no subject, or two, is not bound to criteria about its subject', () => {
  assert.equal(hireCriteria({ category: 'health-factor', brief: 'Venus health factor for my wallet' }), undefined);
  assert.equal(
    hireCriteria({ category: 'health-factor', brief: `Venus health factor for ${ACCOUNT} and 0x1111111111111111111111111111111111111111` }),
    undefined,
  );
});

/*
 * The wiring. Both routes are `server-only`; the decision is tested above
 * and the two call sites are asserted as source facts, the pattern
 * `tests/provider-route-wiring.test.mts` uses. Comments are stripped, so
 * the comment recording the old behaviour cannot satisfy them.
 */
const source = (path: string) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test('the quote route composes criteria when the caller sends none', () => {
  const route = source('app/api/hire/quote/route.ts');
  assert.match(route, /hireCriteria\(\{ category: hireCategory, brief: task \}\)/);
  /* A caller's own criteria still win, so ProofRun and any other caller
     can state their own and are not overridden by the default. */
  assert.match(route, /suppliedCriteria \?\? hireCriteria/);
});

test('a prepared hire is quoted with the category it will be checked under', () => {
  const route = source('app/api/hire/prepare/route.ts');
  assert.match(route, /inner\('\/api\/hire\/quote', \{ chainId, tokenId, task: payload, category: hireCategory \}\)/);
  /* And the envelope records the same value, so the check reads it back. */
  assert.match(route, /category: hireCategory,/);
});
