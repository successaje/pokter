import assert from 'node:assert/strict';
import test from 'node:test';

import { alertableFlows } from '../src/lib/trading/alerts';

const flow = (block: number, at: string, verdict: string) => ({ block, at, verdict });
const flows = [flow(100, '2026-10-21T10:00:00Z', 'not-returned'), flow(200, '2026-10-21T12:00:00Z', 'returned'), flow(300, '2026-10-21T13:00:00Z', 'not-returned')];

test('a new subscriber is told only about what was found after subscribing', () => {
  const r = alertableFlows(flows, { alertedThrough: null, subscribedAt: '2026-10-21T11:00:00Z' });
  assert.deepEqual(r.alert.map((f) => f.block), [300]);
  assert.equal(r.nextThrough, 300);
});

test('nothing is told twice: only flows after the last block covered', () => {
  assert.deepEqual(alertableFlows(flows, { alertedThrough: 300, subscribedAt: '2026-10-21T00:00:00Z' }).alert, []);
  assert.deepEqual(alertableFlows(flows, { alertedThrough: 150, subscribedAt: '2026-10-21T00:00:00Z' }).alert.map((f) => f.block), [300]);
});

test('flows that came back move the bookmark but send nothing', () => {
  const r = alertableFlows([flow(400, '2026-10-21T14:00:00Z', 'returned')], { alertedThrough: 300, subscribedAt: '2026-10-21T00:00:00Z' });
  assert.deepEqual(r.alert, []);
  assert.equal(r.nextThrough, 400);
});

test('no new flows leave the bookmark where it was', () => {
  assert.equal(alertableFlows([], { alertedThrough: 300, subscribedAt: '2026-10-21T00:00:00Z' }).nextThrough, 300);
  assert.equal(alertableFlows([], { alertedThrough: null, subscribedAt: '2026-10-21T00:00:00Z' }).nextThrough, null);
});

test('a trading alert link lands on the trading page', async () => {
  const { emailLinkDestination } = await import('../src/lib/notifications/link-destination');
  assert.equal(emailLinkDestination({ kind: 'trading' }), '/trading');
});
