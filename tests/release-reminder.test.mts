import assert from 'node:assert/strict';
import test from 'node:test';

import { RELEASE_CLOSING_NOTICE_MS, releaseReminderDue } from '../src/lib/jobs/release-reminder';

// Job 56:56997's shape: submitted, a 7-day window, a deadline about a day after it closes.
const submittedAt = Date.parse('2026-10-14T18:30:00Z') / 1000;
const window = 7 * 86_400;
const expiredAt = Date.parse('2026-10-22T18:28:00Z') / 1000;
const at = (iso: string, status = 'SUBMITTED') => releaseReminderDue({ status, submittedAt, disputeWindowSeconds: window, expiredAt, now: Date.parse(iso) });

test('nothing while the review window is open', () => {
  assert.equal(at('2026-10-21T18:00:00Z'), null);
});

test('release opens: the first reminder, with when it opened and when it closes', () => {
  const due = at('2026-10-21T19:00:00Z');
  assert.equal(due?.event, 'RELEASE_OPEN');
  assert.equal(new Date(due!.closesAt).toISOString(), '2026-10-22T18:28:00.000Z');
});

test('within the last hours before the deadline: the closing reminder', () => {
  assert.equal(at(new Date(expiredAt * 1000 - RELEASE_CLOSING_NOTICE_MS + 60_000).toISOString())?.event, 'RELEASE_CLOSING');
  assert.equal(at(new Date(expiredAt * 1000 - RELEASE_CLOSING_NOTICE_MS - 60_000).toISOString())?.event, 'RELEASE_OPEN');
});

test('after the deadline, or once settled, or before delivery, nothing', () => {
  assert.equal(at('2026-10-22T18:30:00Z'), null);
  assert.equal(at('2026-10-22T10:00:00Z', 'COMPLETED'), null);
  assert.equal(releaseReminderDue({ status: 'FUNDED', submittedAt: 0, disputeWindowSeconds: window, expiredAt, now: Date.parse('2026-10-22T10:00:00Z') }), null);
});
