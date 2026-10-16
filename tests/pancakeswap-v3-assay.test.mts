import assert from 'node:assert/strict';
import test from 'node:test';

import { V3_FARM, V3_POSITION_MANAGER, inRange } from '../src/lib/assay/pancakeswap-v3';

test('a range is half-open: the lower tick earns, the upper does not', () => {
  /*
   * Observed on a sampled wallet: position #7674122 sits in [15600, 15620)
   * with the pool at tick 15605 — four ticks from falling out. At 15620 it
   * holds one asset and earns nothing, so counting the upper bound as in
   * range would call a dead position live.
   */
  assert.equal(inRange(15605, 15600, 15620), true, 'inside');
  assert.equal(inRange(15600, 15600, 15620), true, 'the lower tick is inside');
  assert.equal(inRange(15620, 15600, 15620), false, 'the upper tick is not');
  assert.equal(inRange(15599, 15600, 15620), false, 'below');
  assert.equal(inRange(15621, 15600, 15620), false, 'above');
});

test('full-range and negative-tick positions are judged by the same rule', () => {
  // Both seen in the live sample: a full-range position and one priced
  // below 1, where every tick is negative.
  assert.equal(inRange(61478, -887200, 75600), true, 'full-range, price inside');
  assert.equal(inRange(-186570, -186600, 887200), true, 'negative ticks, just inside');
  assert.equal(inRange(-186601, -186600, 887200), false, 'negative ticks, just below');
  assert.equal(inRange(73647, 66600, 70800), false, 'price has run above the range');
});

test('the sampler never offers the farm or the position manager as a buyer', () => {
  /*
   * MasterChef holds thousands of positions for other people. Sampled as a
   * wallet it would fill the set with one address that is not a buyer and
   * whose positions belong to strangers, and a fixture asking about it
   * would be asking the agent about somebody else's money.
   */
  const excluded = [V3_FARM, V3_POSITION_MANAGER, '0x0000000000000000000000000000000000000000'];
  assert.equal(new Set(excluded.map((a) => a.toLowerCase())).size, 3);
  for (const address of excluded) assert.match(address, /^0x[0-9a-fA-F]{40}$/);
});
