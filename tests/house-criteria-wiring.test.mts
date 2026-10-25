import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';

import { echoableCriteria, signHouseQuote } from '../src/lib/house/quote';
import { negotiationTermsBound } from '../src/lib/erc8183/negotiation';
import { MAX_TERM_LENGTH, MAX_TERM_STRINGS, bindingFor, criteriaForTerms, isSpecLine, venusAcceptanceSpec } from '../src/lib/proofrun/acceptance';

/*
 * The link between a buyer's criteria and the house agent's signature.
 *
 * `tests/house-signs-criteria.test.mts` proved the signer: handed criteria,
 * `signHouseQuote` binds them. Nothing proved the route that hands them
 * over, and it did not. `signHouseQuote` accepted `successCriteria`; its
 * one production caller never passed it, so the field was dead in
 * production from the commit that introduced it.
 *
 * A live quote against pokter.xyz carrying all eight Venus criteria came
 * back `accepted`, with `negotiationTermsBound` true, `success_criteria`
 * absent and the binding `pokter-asserted` — the exact path Pokter's
 * integration kit tells third-party builders to implement, which Pokter's
 * own agent did not walk.
 *
 * `rpc.ts` is `server-only`, and under `--conditions=react-server` the
 * escrow address table cannot resolve either, so the handler is
 * unreachable from here in both directions. The decision therefore lives
 * in `echoableCriteria`, tested below against the signer and the verifier,
 * and the one line of wiring is asserted as a source fact — the pattern
 * `tests/provider-route-wiring.test.mts` uses, for the same reason.
 */

/* A key that exists only in this file. It signs test data and holds nothing. */
const TEST_KEY = `0x${'22'.repeat(32)}` as const;
const COMMERCE = '0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE';
const PAYMENT_TOKEN = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
const COMPTROLLER = '0xfD36E2c2a6789Db23113685031d7F16329158384';
const TASK = 'Venus health factor for 0xd213846db9fd0b8b282e00EF67dd899dA58250cc';

const spec = venusAcceptanceSpec({ deployment: COMPTROLLER, chainId: 56 });
const sent = criteriaForTerms(spec);

/* The route's own expression, so a change to it is a change to this test. */
async function quoteAs(requestCriteria: unknown) {
  return signHouseQuote({
    definition: { priceU: 0.1, deliverables: 'A health factor report with its block.', qualityStandards: 'Read-only analysis.' } as never,
    account: privateKeyToAccount(TEST_KEY),
    chainId: 97,
    paymentToken: PAYMENT_TOKEN,
    verifyingContract: COMMERCE,
    task: TASK,
    successCriteria: echoableCriteria(requestCriteria),
  });
}

function bindingOf(quote: Awaited<ReturnType<typeof quoteAs>>, sentCriteria: readonly string[] | undefined) {
  const termsBound = negotiationTermsBound(quote as unknown as Record<string, unknown>, quote.request.task_description);
  assert.equal(termsBound, true, 'the signature did not cover the terms it returned');
  return bindingFor({
    specHash: spec.specHash,
    termsBound,
    signedCriteria: quote.response.terms.success_criteria,
    sentCriteria,
    negotiationHash: quote.negotiation_hash,
  });
}

test('criteria arriving in a negotiate request end up inside the signed terms', async () => {
  const quote = await quoteAs(sent);
  assert.deepEqual(quote.response.terms.success_criteria, sent, 'the criteria were not echoed');
  assert.equal(bindingOf(quote, sent).kind, 'signed-terms');
});

/* Optional, and it stays optional: an agent sent nothing must still quote. */
test('no criteria still quotes, and claims no binding', async () => {
  const quote = await quoteAs(undefined);
  assert.equal(quote.response.terms.success_criteria, undefined);
  assert.equal(bindingOf(quote, undefined).kind, 'pokter-asserted');
});

/*
 * Untrusted input on its way into a signature. Each case costs the binding
 * and not the hire: the quote is still signed and still verifies, and the
 * binding honestly reads `pokter-asserted`, which is what the integration
 * kit already promises when the field is absent. Refusing the quote would
 * contradict that promise and break a hire over an optional field.
 */
test('criteria the agent cannot safely sign are dropped, not refused', async () => {
  const cases: [string, unknown][] = [
    ['too many', Array.from({ length: MAX_TERM_STRINGS + 1 }, (_, i) => `c${i}: a criterion`)],
    ['one too long', [...sent.slice(0, 2), 'x'.repeat(MAX_TERM_LENGTH + 1)]],
    ['not strings', [...sent.slice(0, 2), { id: 'hf.value' }]],
    ['a blank line', [...sent.slice(0, 2), '   ']],
    ['not an array', 'hf.value: matches Venus'],
    ['empty', []],
    ['null', null],
  ];
  for (const [label, criteria] of cases) {
    assert.equal(echoableCriteria(criteria), undefined, `${label} was accepted for signing`);
    const quote = await quoteAs(criteria);
    assert.equal(quote.response.accepted, true, `${label} refused the quote`);
    assert.equal(quote.response.terms.success_criteria, undefined, `${label} was echoed`);
    assert.equal(bindingOf(quote, sent).kind, 'pokter-asserted', label);
  }
});

/*
 * The whole array or none of it. `echoableCriteria` must never return a
 * filtered subset, because dropping the spec line is exactly what stops a
 * signature binding — see below.
 */
test('a sanitised criterion is kept, and the array is never filtered', () => {
  const bracketed = [...sent.slice(0, 3), 'health_factor within [0.005] of Venus'];
  const echoed = echoableCriteria(bracketed);
  assert.ok(echoed, 'a bracketed criterion was rejected');
  assert.equal(echoed.length, bracketed.length, 'a criterion was dropped instead of the whole array');
  assert.match(echoed[3], /\(0\.005\)/, 'the bracket was not sanitised before signing');
});

/*
 * What the binding actually turns on, pinned because it is easy to get
 * backwards. The spec line carries the hash of every criterion, so an
 * agent that signs that one line has agreed to the whole spec — that is
 * the point of sending a hash the prose only summarises, and why
 * `criteriaForTerms` may replace its last prose slot with "and N more".
 *
 * Prose without the spec line is the case that must not bind: those
 * strings are a summary, and agreeing to a summary is not agreeing to the
 * spec it stands for.
 */
test('the spec line is what binds, and prose without it does not', () => {
  const specLine = sent[0];
  assert.ok(isSpecLine(specLine), 'criteriaForTerms no longer puts the spec line first');

  assert.equal(
    bindingFor({ specHash: spec.specHash, termsBound: true, signedCriteria: [specLine], sentCriteria: sent }).kind,
    'signed-terms',
    'signing the spec hash no longer counts as agreeing to the spec',
  );
  assert.equal(
    bindingFor({ specHash: spec.specHash, termsBound: true, signedCriteria: sent.slice(1), sentCriteria: sent }).kind,
    'pokter-asserted',
    'prose echoed without the spec line was treated as agreement to the spec',
  );
  /* And a signature that covers nothing never binds, whatever it echoed. */
  assert.equal(
    bindingFor({ specHash: spec.specHash, termsBound: false, signedCriteria: sent, sentCriteria: sent }).kind,
    'pokter-asserted',
    'criteria were trusted from a signature that did not cover the terms',
  );
});

/*
 * The wiring. Comments are stripped first, so a comment describing the
 * call cannot satisfy it — which matters here, because the comment above
 * the call records the bug it fixed.
 */
test('the house negotiate handler passes the request criteria to the signer', () => {
  const rpc = readFileSync(new URL('../src/lib/house/rpc.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  assert.match(rpc, /echoableCriteria/, 'rpc.ts no longer validates the criteria it is sent');
  assert.match(
    rpc,
    /successCriteria:\s*echoableCriteria\(terms\?\.success_criteria\)/,
    'the negotiate handler does not pass terms.success_criteria to signHouseQuote',
  );
  /* Read off the request's terms, which is where the kit says to send them. */
  assert.match(rpc, /const terms = object\(data\.terms\)/, 'the handler no longer reads the request terms');
});
