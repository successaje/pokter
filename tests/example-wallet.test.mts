import assert from 'node:assert/strict';
import test from 'node:test';

import { checkExampleWallets, replaceWallet } from '../src/lib/hire/example-wallet';

const EXAMPLE = '0x0aEe98f6317ad64472330CA09af6c076BeE99aB7';
const examples = [`Venus health factor for ${EXAMPLE} and the repay that restores 1.5`, 'How close is 0x… to liquidation on Venus?'];

test("an agent's example wallet left in the brief is flagged, edited around or not", () => {
  assert.deepEqual(checkExampleWallets(examples[0], examples).exampleWallets, [EXAMPLE.toLowerCase()]);
  assert.deepEqual(checkExampleWallets(`Health factor for ${EXAMPLE.toLowerCase()}, target 1.3`, examples).exampleWallets, [EXAMPLE.toLowerCase()]);
});

test("the buyer's own wallet, or a confirmed example, passes", () => {
  assert.deepEqual(checkExampleWallets('Health factor for 0x1111111111111111111111111111111111111111', examples).exampleWallets, []);
  assert.deepEqual(checkExampleWallets(examples[0], examples, new Set([EXAMPLE.toLowerCase()])).exampleWallets, []);
});

test('a 0x… placeholder is caught; a real address is not mistaken for one', () => {
  assert.equal(checkExampleWallets(examples[1], examples).placeholder, true);
  assert.equal(checkExampleWallets('Check 0x... please', examples).placeholder, true);
  assert.equal(checkExampleWallets(`Check ${EXAMPLE}`, examples).placeholder, false);
});

test('swapping in the buyer wallet replaces every occurrence', () => {
  const mine = '0x2222222222222222222222222222222222222222';
  assert.equal(replaceWallet(`${EXAMPLE} then ${EXAMPLE.toLowerCase()}`, EXAMPLE, mine), `${mine} then ${mine}`);
});
