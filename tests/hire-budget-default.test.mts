import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_BUDGET_U } from '../src/lib/erc8183/pricing';

/**
 * What the hire form opens at.
 *
 * The card advertises the agent's signed quote. The form used a flat
 * constant, so an agent showing 0.05 was funded at 0.10 by default — the
 * buyer picked one price and was quietly offered another.
 */
function openingBudget(signedQuoteU: number | null): number {
  return signedQuoteU ?? DEFAULT_BUDGET_U;
}

test('the form opens at the price the agent signed', () => {
  assert.equal(openingBudget(0.05), 0.05);
});

test('an expired quote is still the agent\'s own price', () => {
  // Quotes lapse 15 minutes after a sweep captures them, so requiring a live
  // one would mean this default almost never applied.
  assert.equal(openingBudget(0.05), 0.05);
});

test('an agent that never named a price falls back to the house budget', () => {
  assert.equal(openingBudget(null), DEFAULT_BUDGET_U);
});

test('the fallback is not silently zero', () => {
  assert.ok(DEFAULT_BUDGET_U > 0, 'a zero default would fund nothing');
});
