import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_WAIT_MS, msUntil } from '../src/lib/ui/use-moment';

const NOW = Date.parse('2026-10-16T12:00:00.000Z');

test('a future moment is waited for, a past one is not', () => {
  assert.equal(msUntil(NOW / 1000 + 60, NOW), 60_000);
  assert.equal(msUntil(NOW / 1000, NOW), null, 'the moment itself has arrived');
  assert.equal(msUntil(NOW / 1000 - 1, NOW), null);
  assert.equal(msUntil(null, NOW), null);
});

test('a wait is clamped to a day', () => {
  /*
   * setTimeout keeps its delay in a signed 32-bit int, so anything past
   * ~24.9 days wraps and fires immediately. A job with a nonsense deadline
   * would otherwise flip the UI the instant it loaded.
   */
  assert.equal(msUntil(NOW / 1000 + 400 * 86_400, NOW), MAX_WAIT_MS);
  assert.ok(MAX_WAIT_MS < 2 ** 31 - 1, 'the clamp is inside the 32-bit range');
});

test('a nonsense timestamp waits for nothing', () => {
  assert.equal(msUntil(Number.NaN, NOW), null);
  assert.equal(msUntil(Number.POSITIVE_INFINITY, NOW), null);
});
