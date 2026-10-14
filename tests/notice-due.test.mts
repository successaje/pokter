import assert from 'node:assert/strict';
import test from 'node:test';

import { NOTICE_GRACE_MS, NOTICE_MAX_ATTEMPTS, NOTICE_RETRY_MS, noticeDue } from '../src/lib/erc8183/notice-due';

const now = Date.parse('2026-10-14T17:00:00Z');
const job = { hiredAtMs: now - 10 * 60_000, expiresAtMs: now + 23 * 3_600_000 };

test('a funded job nobody told the seller about is told by the sweep', () => {
  // The buyer closed the tab before the hire page sent the notice.
  assert.equal(noticeDue(job, null, now), true);
});

test('the hire page gets the first go', () => {
  assert.equal(noticeDue({ ...job, hiredAtMs: now - NOTICE_GRACE_MS + 1 }, null, now), false);
});

test("a seller's answer is final", () => {
  assert.equal(noticeDue(job, { status: 'rejected', attempts: 1, lastAtMs: now - 3_600_000 }, now), false);
  assert.equal(noticeDue(job, { status: 'accepted', attempts: 1, lastAtMs: now - 3_600_000 }, now), false);
});

test('an unreachable seller is retried, spaced out, a few times', () => {
  assert.equal(noticeDue(job, { status: 'unreachable', attempts: 1, lastAtMs: now - NOTICE_RETRY_MS }, now), true);
  assert.equal(noticeDue(job, { status: 'unreachable', attempts: 1, lastAtMs: now - 60_000 }, now), false);
  assert.equal(noticeDue(job, { status: 'unreachable', attempts: NOTICE_MAX_ATTEMPTS, lastAtMs: now - 3_600_000 }, now), false);
});

test('an expired job is not announced', () => {
  assert.equal(noticeDue({ ...job, expiresAtMs: now - 1 }, null, now), false);
});
