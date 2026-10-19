import assert from 'node:assert/strict';
import test from 'node:test';

import { interpretBrief } from '../src/lib/brief/interpret';
import { TASK_SUGGESTIONS } from '../src/features/home/TaskSearch';

test('the home page’s own example searches read as what they ask for', () => {
  const read = (q: string) => interpretBrief(q).category;
  // Each example runs its full wording, whatever its short label says.
  assert.deepEqual(TASK_SUGGESTIONS.map((s) => read(s.query)), ['health-factor', 'token-safety', 'yield']);
  assert.equal(read('Review a liquidity position'), 'rebalancing');
  assert.equal(read('Monitor the liquidation risk of my lending position'), 'health-factor');
  assert.equal(read('Check the liquidation risk of my lending position'), 'health-factor');
  assert.equal(read('Check how far my portfolio has drifted from target'), 'rebalancing');
  assert.equal(read('Review whether my grid trading range still fits the market'), 'grid-trading');
});

test('a short signal inside a longer phrase is part of that phrase', () => {
  // "safe" (health factor) inside "safety" and "safe to buy" (token safety).
  assert.equal(interpretBrief('token safety').category, 'token-safety');
  assert.equal(interpretBrief('is this token safe to buy?').category, 'token-safety');
  // On its own, "safe" still reads as protecting a position.
  assert.equal(interpretBrief('keep my Venus loan safe').category, 'health-factor');
  assert.equal(interpretBrief('hello there').category, null);
});
