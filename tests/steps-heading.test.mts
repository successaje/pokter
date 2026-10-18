import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * The heading over the hiring steps promises a way out, so it has to
 * agree with the step that takes the money.
 *
 * It read "you can leave at any of the first three" while the third step,
 * `Hire`, is the one that funds the escrow — and carries `free: false` in
 * the same file to say so. A buyer was told they could walk away at the
 * step where they commit.
 */
const src = readFileSync(new URL('../src/features/home/StepRail.tsx', import.meta.url), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '');

test('the heading does not offer a way out at the funding step', () => {
  assert.doesNotMatch(code, /leave at any of the first three/);
});

test('it names funding as the line that is crossed', () => {
  assert.match(code, /stop before you fund/);
});

test('the step that funds is still the one marked not free', () => {
  // If this flips, the heading above has to be read again.
  const steps = [...code.matchAll(/step: '([^']+)'[\s\S]*?free: (true|false)/g)].map((m) => [m[1], m[2] === 'true'] as const);
  assert.deepEqual(steps, [
    ['Find', true],
    ['Evaluate', true],
    ['Hire', false],
    ['Receive', false],
    ['Review', false],
  ]);
  const firstPaid = steps.findIndex(([, free]) => !free);
  assert.equal(steps[firstPaid][0], 'Hire', 'funding starts at Hire, so "before you fund" means the first two');
});
