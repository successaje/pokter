import assert from 'node:assert/strict';
import test from 'node:test';

import { BRIEF_MIN, briefLongEnough } from '../src/lib/hire/brief-length';

/*
 * Whether a brief is substantial enough to send an agent.
 *
 * The floor stops somebody funding escrow with "hi". It also refused
 * "56/303779" — nine characters, and the exact string Pokter's evidence
 * agent publishes on its card as how to ask it — in three places,
 * including the free trial whose whole point is trying an agent the way
 * it says to be tried.
 */

const DECLARED = ['56/303779', 'eip155:97:2554'];

test('a brief the agent published is accepted however short', () => {
  assert.equal(briefLongEnough('56/303779', DECLARED), true);
  assert.equal(briefLongEnough('eip155:97:2554', DECLARED), true);
});

test('matching ignores case and surrounding space, as a paste would', () => {
  assert.equal(briefLongEnough('  56/303779  ', DECLARED), true);
  assert.equal(briefLongEnough('EIP155:97:2554', DECLARED), true);
});

test('short text nobody published is still refused', () => {
  assert.equal(briefLongEnough('hi', DECLARED), false);
  assert.equal(briefLongEnough('56/999999', DECLARED), false, 'plausible, and not declared');
  assert.equal(briefLongEnough('', DECLARED), false);
  assert.equal(briefLongEnough('   ', DECLARED), false);
});

test('an agent that declares nothing keeps the plain floor', () => {
  assert.equal(briefLongEnough('56/303779', []), false);
  assert.equal(briefLongEnough('a'.repeat(BRIEF_MIN), []), true);
  assert.equal(briefLongEnough('a'.repeat(BRIEF_MIN - 1), []), false);
});

test('ordinary free text never depends on the card', () => {
  assert.equal(briefLongEnough('Report what you measured about this agent.', []), true);
});
