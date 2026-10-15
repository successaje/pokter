import assert from 'node:assert/strict';
import test from 'node:test';

import { recipeById, recipeForExample, recipeProblems } from '../src/lib/hire/brief-recipes';
import { templatesFromSkills } from '../src/lib/hire/taskTemplates';

const EXAMPLE = 'Desk brief for shorting 0.01 NVDAB against 10 USDT over the weekend';

test('Stockroom’s published example is recognised as the borrow-desk format', () => {
  const recipe = recipeForExample(EXAMPLE);
  assert.equal(recipe?.id, 'lending-desk');
  assert.deepEqual(recipe?.parse(EXAMPLE), { side: 'shorting', size: '0.01', asset: 'NVDAB', collateral: '10', collateralToken: 'USDT', horizon: 'over the weekend' });
  const [template] = templatesFromSkills([{ name: 'Quote a Stockroom borrow desk brief', kind: 'paid', examples: [EXAMPLE] }]);
  assert.equal(template.recipe, 'lending-desk');
});

test('the buyer’s answers compose into the agent’s exact wording, and parse back', () => {
  const recipe = recipeById('lending-desk')!;
  const values = { side: 'borrowing', size: '2', asset: 'tslab', collateral: '500', collateralToken: 'usdt', horizon: 'for two weeks' };
  const brief = recipe.compose(values);
  assert.equal(brief, 'Desk brief for borrowing 2 TSLAB against 500 USDT for two weeks');
  assert.equal(recipe.parse(brief)?.asset, 'TSLAB');
});

test('an incomplete or malformed answer is named, not composed', () => {
  const recipe = recipeById('lending-desk')!;
  assert.deepEqual(recipeProblems(recipe, { side: 'shorting', size: '-1', asset: 'NVDAB', collateral: '', collateralToken: 'USDT', horizon: 'a week' }), [
    'size must be a positive number',
    'collateral is empty',
  ]);
});

test('an example in no known format gets no guided fields', () => {
  assert.equal(recipeForExample('56/303779'), null);
  assert.equal(recipeForExample('Where should 1000 USDT earn the most on BNB Chain right now?'), null);
});
