import assert from 'node:assert/strict';
import test from 'node:test';

import { clipAtWord } from '../src/lib/ui/clip';

test('short text is untouched', () => {
  assert.equal(clipAtWord('Ranks Venus markets', 50), 'Ranks Venus markets');
});

test('a cut ends on a whole word and says it was cut', () => {
  const out = clipAtWord('Ranks every Venus core-pool market by supply APY and gas cost', 30);
  assert.ok(out.endsWith('…'));
  assert.ok(out.length <= 30);
  assert.ok('Ranks every Venus core-pool market by supply APY and gas cost'.startsWith(out.slice(0, -1)));
  assert.doesNotMatch(out, /\s…$/);
});

test('one long token is cut where it must be', () => {
  const out = clipAtWord(`0x${'a'.repeat(80)}`, 20);
  assert.equal(out.length, 20);
});
