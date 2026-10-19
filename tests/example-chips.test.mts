import assert from 'node:assert/strict';
import test from 'node:test';

import { exampleLabels, withWalletPlaceholder } from '../src/lib/hire/example-chips';
import { checkExampleWallets } from '../src/lib/hire/example-wallet';
import { templatesFromSkills } from '../src/lib/hire/taskTemplates';

// Brinkwatch's card, as published (src/lib/house/agents/brinkwatch.ts).
const BRINKWATCH = [
  'Venus health factor for 0x0aEe98f6317ad64472330CA09af6c076BeE99aB7 and the repay that restores 1.5',
  'Venus health factor for 0x… and the repay that restores 1.5',
  'How close is 0x… to liquidation on Venus? Target health factor 1.3',
  'Check the Venus position of 0x…',
];

test('Brinkwatch’s card reads as three named chips, its two wordings of one brief counted once', () => {
  const templates = templatesFromSkills([{ name: 'Venus health factor and liquidation distance', kind: 'paid', examples: BRINKWATCH }]);
  assert.equal(templates.length, 3);
  assert.deepEqual(exampleLabels(templates.map((t) => t.task)), ['Repayment target', 'Liquidation distance', 'Position check']);
});

test('a plain health-factor question is labelled as one', () => {
  assert.deepEqual(exampleLabels(['Venus health factor for 0x…']), ['Health factor']);
});

test('someone else’s wallet becomes a placeholder the buyer must fill', () => {
  const brief = withWalletPlaceholder(BRINKWATCH[0]);
  assert.equal(brief, 'Venus health factor for [wallet address] and the repay that restores 1.5');
  assert.equal(checkExampleWallets(brief, BRINKWATCH).placeholder, true, 'blocks Review until replaced');
});

test('a token or contract address in an example is kept, not blanked', () => {
  const token = 'Check token 0x55d398326f99059fF775485246999027B3197955 for honeypot risk';
  assert.equal(withWalletPlaceholder(token), token);
});

test('labels that would repeat fall back to each example’s own words', () => {
  const labels = exampleLabels(['Grid plan for BNB between 500 and 700', 'Grid plan for CAKE between 1 and 3']);
  assert.equal(new Set(labels).size, 2);
  assert.ok(labels.every((l) => l.length <= 26));
});

test('an example with no recognisable intent is labelled by its opening words', () => {
  assert.deepEqual(exampleLabels(['Desk brief for shorting 0.01 NVDAB against 10 USDT over the weekend']), ['Desk brief for shorting…']);
});

test('in a JSON example the wallet field is emptied, ready for the buyer’s own wallet', () => {
  assert.equal(withWalletPlaceholder('{"wallet":"0x0aEe98f6317ad64472330CA09af6c076BeE99aB7","target":1.5}'), '{"wallet":"","target":1.5}');
});
