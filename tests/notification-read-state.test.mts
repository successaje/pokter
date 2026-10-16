import assert from 'node:assert/strict';
import test from 'node:test';

import {
  itemRead, mergeWatermark, readTokenUsable, unreadCount, watermarkFor,
} from '../src/lib/notifications/read-state';

const at = (iso: string) => ({ createdAt: iso });

test('a watermark reads everything up to its instant, across devices', () => {
  const mark = { seenThrough: '2026-10-16T12:00:00.000Z' };
  assert.equal(itemRead(at('2026-10-16T11:59:59.000Z'), mark), true);
  assert.equal(itemRead(at('2026-10-16T12:00:00.000Z'), mark), true, 'the boundary item is included');
  assert.equal(itemRead(at('2026-10-16T12:00:01.000Z'), mark), false);
  assert.equal(itemRead(at('2026-10-16T11:00:00.000Z'), null), false, 'with no watermark nothing is read');
});

test('a device that read one item alone does not wait for a round trip', () => {
  const item = { createdAt: '2026-10-16T13:00:00.000Z', readAt: '2026-10-16T13:00:05.000Z' };
  assert.equal(itemRead(item, null), true);
});

test('a watermark only ever moves forward', () => {
  /*
   * A device that was offline holds a stale value. Letting it win would
   * mark settled work unread again on every sync, and a badge that comes
   * back is worse than one that never cleared: the buyer stops believing
   * any of them.
   */
  const older = { seenThrough: '2026-10-16T10:00:00.000Z' };
  const newer = { seenThrough: '2026-10-16T12:00:00.000Z' };
  assert.deepEqual(mergeWatermark(older, newer), newer);
  assert.deepEqual(mergeWatermark(newer, older), newer);
  assert.deepEqual(mergeWatermark(null, older), older);
  assert.deepEqual(mergeWatermark(older, null), older);
  assert.equal(mergeWatermark(null, null), null);
});

test('opening the inbox marks what was in it, not what arrives next', () => {
  /*
   * The newest item's own timestamp, never the clock. "Now" would also
   * cover anything created between the render and the write — work the
   * buyer never saw, marked read because they were on the page when it
   * landed.
   */
  const items = [at('2026-10-16T09:00:00.000Z'), at('2026-10-16T11:30:00.000Z'), at('2026-10-16T10:00:00.000Z')];
  assert.deepEqual(watermarkFor(items), { seenThrough: '2026-10-16T11:30:00.000Z' });
  assert.equal(watermarkFor([]), null, 'an empty inbox marks nothing');

  const mark = watermarkFor(items)!;
  assert.equal(unreadCount(items, mark), 0);
  assert.equal(unreadCount([...items, at('2026-10-16T11:30:01.000Z')], mark), 1, 'the next arrival is still unread');
});

test('a malformed timestamp never silently marks an inbox read', () => {
  assert.equal(watermarkFor([at('not a date')]), null);
  assert.equal(itemRead(at('not a date'), { seenThrough: '2026-10-16T12:00:00.000Z' }), false);
});

test('an expired token is refused rather than retried forever', () => {
  const now = Date.parse('2026-10-16T12:00:00.000Z');
  assert.equal(readTokenUsable({ expiresAt: '2026-10-17T00:00:00.000Z' }, now), true);
  assert.equal(readTokenUsable({ expiresAt: '2026-10-16T11:59:59.000Z' }, now), false);
  assert.equal(readTokenUsable(null, now), false);
});
