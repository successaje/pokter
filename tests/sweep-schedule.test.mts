import assert from 'node:assert/strict';
import test from 'node:test';

import { staleAlertDue, sweepDue, sweepRecent } from '../src/lib/history/schedule';

const NOW = Date.parse('2026-10-15T13:00:00Z');
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();

test('a sweep is due two hours after the last one finished, or when none ever has', () => {
  assert.equal(sweepDue(at(1.9), NOW), false);
  assert.equal(sweepDue(at(2), NOW), true);
  assert.equal(sweepDue(null, NOW), true);
});

test('a backup trigger stands down within ninety minutes of a sweep', () => {
  assert.equal(sweepRecent(at(1), NOW), true);
  assert.equal(sweepRecent(at(1.6), NOW), false);
  assert.equal(sweepRecent(null, NOW), false);
});

test('six hours without a sweep alerts once per outage', () => {
  // 15 October: last sweep 04:43, nothing until a manual run at 12:52.
  const last = '2026-10-15T04:43:16Z';
  assert.equal(staleAlertDue(last, null, Date.parse('2026-10-15T10:00:00Z')), false);
  assert.equal(staleAlertDue(last, null, Date.parse('2026-10-15T10:44:00Z')), true);
  // Already alerted during this outage: not again.
  assert.equal(staleAlertDue(last, '2026-10-15T10:44:00Z', Date.parse('2026-10-15T12:00:00Z')), false);
  // A later outage, after sweeps resumed, alerts again.
  assert.equal(staleAlertDue('2026-10-16T00:00:00Z', '2026-10-15T10:44:00Z', Date.parse('2026-10-16T07:00:00Z')), true);
});
