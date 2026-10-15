import assert from 'node:assert/strict';
import test from 'node:test';

import { budgetDefault } from '../src/lib/hire/budget-default';
import { DEFAULT_BUDGET_U } from '../src/lib/erc8183/pricing';

/**
 * The hire negotiates a fresh quote at funding and refuses a budget below
 * it, so this number decides whether a hire completes at all.
 */

test('a current signed price wins', () => {
  assert.equal(budgetDefault({ signedU: 0.5, lastSignedU: 0.3, suggestedU: 0.2 }), 0.5);
});

test('an expired signed price beats the suggestion and the constant', () => {
  // The case that broke: a quote lasts fifteen minutes, so nearly every
  // stored quote is expired. Treating that as "no price" opened the field
  // at 0.1 for an agent that signs 0.5, and the hire was then refused.
  assert.equal(budgetDefault({ signedU: null, lastSignedU: 0.5, suggestedU: 0.2 }), 0.5);
  assert.equal(budgetDefault({ signedU: null, lastSignedU: 0.5 }), 0.5);
});

test('the suggestion is used only when no price was ever signed', () => {
  assert.equal(budgetDefault({ suggestedU: 0.25 }), 0.25);
});

test('nothing known falls back to the published default', () => {
  assert.equal(budgetDefault({}), DEFAULT_BUDGET_U);
  assert.equal(budgetDefault({ signedU: null, lastSignedU: null, suggestedU: null }), DEFAULT_BUDGET_U);
});

test('a zero or broken price is not a price', () => {
  // A free agent still needs a budget the escrow accepts, and NaN as a
  // starting value makes the field unusable rather than merely wrong.
  assert.equal(budgetDefault({ signedU: 0, lastSignedU: 0.4 }), 0.4);
  assert.equal(budgetDefault({ signedU: Number.NaN, suggestedU: 0.3 }), 0.3);
  assert.equal(budgetDefault({ lastSignedU: -1 }), DEFAULT_BUDGET_U);
});
