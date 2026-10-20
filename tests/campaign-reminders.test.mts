import assert from 'node:assert/strict';
import test from 'node:test';

import { dueDeadlineReminder, hireProgressNews, settledWith } from '../src/lib/campaign/reminders';

const DAY = 86_400_000;
const ends = Date.parse('2026-11-05T12:00:00Z');
const subscribed = ends - 20 * DAY;

test('nothing is due until a week before the close', () => {
  assert.equal(dueDeadlineReminder({ nowMs: ends - 8 * DAY, endsAtMs: ends, subscribedAtMs: subscribed, sent: [] }), null);
  assert.equal(dueDeadlineReminder({ nowMs: ends - 7 * DAY, endsAtMs: ends, subscribedAtMs: subscribed, sent: [] })?.id, '7d');
});

test('each reminder is sent once, then the next when it comes due', () => {
  assert.equal(dueDeadlineReminder({ nowMs: ends - 6 * DAY, endsAtMs: ends, subscribedAtMs: subscribed, sent: ['7d'] }), null);
  assert.equal(dueDeadlineReminder({ nowMs: ends - 2 * DAY + 1, endsAtMs: ends, subscribedAtMs: subscribed, sent: ['7d'] })?.id, '2d');
  assert.equal(dueDeadlineReminder({ nowMs: ends - 3_600_000, endsAtMs: ends, subscribedAtMs: subscribed, sent: ['7d', '2d'] })?.id, '1d');
});

test('a missed sweep sends only the latest reminder, and settles the earlier ones with it', () => {
  const due = dueDeadlineReminder({ nowMs: ends - 1.5 * DAY, endsAtMs: ends, subscribedAtMs: subscribed, sent: [] });
  assert.equal(due?.id, '2d');
  assert.deepEqual(settledWith(due!), ['7d', '2d']);
});

test('subscribing with three days left skips the week reminder', () => {
  const late = ends - 3 * DAY;
  assert.equal(dueDeadlineReminder({ nowMs: late + 60_000, endsAtMs: ends, subscribedAtMs: late, sent: [] }), null);
  assert.equal(dueDeadlineReminder({ nowMs: ends - 2 * DAY, endsAtMs: ends, subscribedAtMs: late, sent: [] })?.id, '2d');
});

test('nothing is sent once the campaign has closed', () => {
  assert.equal(dueDeadlineReminder({ nowMs: ends, endsAtMs: ends, subscribedAtMs: subscribed, sent: [] }), null);
});

test('only a rise in distinct agents is news; the first reading is a baseline', () => {
  assert.equal(hireProgressNews(null, 2), false);
  assert.equal(hireProgressNews(1, 2), true);
  assert.equal(hireProgressNews(2, 2), false);
  assert.equal(hireProgressNews(3, 2), false);
});

test('a confirm or unsubscribe link for reminders lands on the Set and Earn page', async () => {
  const { emailLinkDestination } = await import('../src/lib/notifications/link-destination');
  assert.equal(emailLinkDestination({ kind: 'campaign' }), '/set-and-earn');
});
