import assert from 'node:assert/strict';
import test from 'node:test';

import { alertFor, dropToLiquidation, levelOf, REPEAT_MS, staleDue } from '../src/lib/loan-watch/rules';

test('levels follow the health factor, worst at liquidation', () => {
  assert.equal(levelOf(null, 1.5), 'no-debt');
  assert.equal(levelOf(1.8, 1.5), 'safe');
  assert.equal(levelOf(1.4, 1.5), 'below');
  assert.equal(levelOf(1.05, 1.5), 'danger');
  assert.equal(levelOf(0.97, 1.5), 'liquidatable');
});

test('a position hovering on the line is not safe again until it clears it with room', () => {
  assert.equal(levelOf(1.52, 1.5, 'below'), 'below');
  assert.equal(levelOf(1.56, 1.5, 'below'), 'safe');
  assert.equal(levelOf(1.52, 1.5, 'safe'), 'safe');
});

test('the first reading is a silent baseline when safe, and an alert when already under the line', () => {
  assert.equal(alertFor({ previous: null, next: 'safe', lastAlertAtMs: null, nowMs: 0 }), null);
  assert.equal(alertFor({ previous: null, next: 'no-debt', lastAlertAtMs: null, nowMs: 0 }), null);
  assert.equal(alertFor({ previous: null, next: 'below', lastAlertAtMs: null, nowMs: 0 }), 'worse');
});

test('getting worse always emails; staying put does not, except in danger after the repeat interval', () => {
  assert.equal(alertFor({ previous: 'safe', next: 'below', lastAlertAtMs: null, nowMs: 0 }), 'worse');
  assert.equal(alertFor({ previous: 'below', next: 'danger', lastAlertAtMs: 0, nowMs: 60_000 }), 'worse');
  assert.equal(alertFor({ previous: 'below', next: 'below', lastAlertAtMs: 0, nowMs: REPEAT_MS * 3 }), null);
  assert.equal(alertFor({ previous: 'danger', next: 'danger', lastAlertAtMs: 0, nowMs: REPEAT_MS - 1 }), null);
  assert.equal(alertFor({ previous: 'danger', next: 'danger', lastAlertAtMs: 0, nowMs: REPEAT_MS }), 'still-danger');
  assert.equal(alertFor({ previous: 'liquidatable', next: 'liquidatable', lastAlertAtMs: 0, nowMs: REPEAT_MS }), 'still-danger');
});

test('recovering to safe emails once; improving within the danger zone does not', () => {
  assert.equal(alertFor({ previous: 'below', next: 'safe', lastAlertAtMs: 0, nowMs: 1 }), 'recovered');
  assert.equal(alertFor({ previous: 'liquidatable', next: 'danger', lastAlertAtMs: 0, nowMs: 1 }), null);
  assert.equal(alertFor({ previous: 'safe', next: 'safe', lastAlertAtMs: 0, nowMs: 1 }), null);
});

test('one stale warning after two hours without a reading', () => {
  const h = 3_600_000;
  assert.equal(staleDue({ lastOkAtMs: 0, createdAtMs: 0, nowMs: h, staleSent: false }), false);
  assert.equal(staleDue({ lastOkAtMs: 0, createdAtMs: 0, nowMs: 2 * h, staleSent: false }), true);
  assert.equal(staleDue({ lastOkAtMs: 0, createdAtMs: 0, nowMs: 5 * h, staleSent: true }), false);
});

test('the drop to liquidation is one minus the reciprocal of the health factor', () => {
  assert.equal(Math.round(dropToLiquidation(1.344)! * 1000) / 10, 25.6);
  assert.equal(dropToLiquidation(0.9), 0);
  assert.equal(dropToLiquidation(null), null);
});

test('a confirm or unsubscribe link for loan alerts lands on the alerts page', async () => {
  const { emailLinkDestination } = await import('../src/lib/notifications/link-destination');
  assert.equal(emailLinkDestination({ kind: 'loan-watch' }), '/watch');
});
