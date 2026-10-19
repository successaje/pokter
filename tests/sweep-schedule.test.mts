import assert from 'node:assert/strict';
import test from 'node:test';

import {
  registryPageOffset,
  staleAlertDue,
  sweepBatch,
  sweepDue,
  sweepRecent,
} from '../src/lib/history/schedule';

const NOW = Date.parse('2026-10-15T13:00:00Z');
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

test('a sweep is due ten minutes after the last one finished, or when none ever has', () => {
  assert.equal(sweepDue(minsAgo(9), NOW), false);
  assert.equal(sweepDue(minsAgo(10), NOW), true);
  assert.equal(sweepDue(null, NOW), true);
});

test('a backup trigger stands down just inside the sweep interval', () => {
  assert.equal(sweepRecent(minsAgo(7), NOW), true);
  assert.equal(sweepRecent(minsAgo(9), NOW), false);
  assert.equal(sweepRecent(null, NOW), false);
  // Below the interval, so standing down never suppresses a due sweep.
  assert.ok(sweepRecent(minsAgo(9.9), NOW) === false && sweepDue(minsAgo(9.9), NOW) === false);
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

test('a bounded sweep measures the agents whose readings are oldest', () => {
  const roster = [{ tokenId: 'a' }, { tokenId: 'b' }, { tokenId: 'c' }, { tokenId: 'd' }];
  const lastProbed = new Map([
    ['a', minsAgo(5)],
    ['b', minsAgo(600)],
    ['c', minsAgo(90)],
    // 'd' has never been probed.
  ]);

  assert.deepEqual(
    sweepBatch(roster, lastProbed, 2).map((e) => e.tokenId),
    ['d', 'b'],
    'never probed first, then the oldest reading',
  );
  assert.deepEqual(
    sweepBatch(roster, lastProbed, 10).map((e) => e.tokenId),
    ['d', 'b', 'c', 'a'],
    'a batch larger than the roster takes all of it, still stalest first',
  );
  assert.deepEqual(sweepBatch(roster, lastProbed, 0), []);
});

test('successive bounded sweeps cover the roster', () => {
  // The property the batching exists for: no run walks the whole roster, and
  // every agent is reached within a few runs because being measured is what
  // moves an agent to the back of the queue.
  const roster = Array.from({ length: 9 }, (_, i) => ({ tokenId: `a${i}` }));
  const lastProbed = new Map<string, string>();
  const reached = new Set<string>();

  for (let run = 0; run < 3; run += 1) {
    const batch = sweepBatch(roster, lastProbed, 3);
    assert.equal(batch.length, 3, 'a run never takes more than its batch');
    for (const entry of batch) {
      reached.add(entry.tokenId);
      lastProbed.set(entry.tokenId, new Date(NOW + run * 60_000).toISOString());
    }
  }

  assert.equal(reached.size, 9, 'three runs of three cover a roster of nine exactly once');
});

test('a run that measured nothing leaves the queue where it was', () => {
  // A sweep cut short by its budget records no reading for the agents it
  // skipped, so the next run starts with the same ones rather than moving on.
  const roster = [{ tokenId: 'x' }, { tokenId: 'y' }, { tokenId: 'z' }];
  const lastProbed = new Map<string, string>();
  const first = sweepBatch(roster, lastProbed, 2).map((e) => e.tokenId);
  assert.deepEqual(sweepBatch(roster, lastProbed, 2).map((e) => e.tokenId), first);
});

test('the registry page advances with the schedule and wraps', () => {
  const depth = 150;
  const t = (ticks: number) => registryPageOffset(ticks * 10 * 60 * 1000, depth);

  assert.deepEqual([t(0), t(1), t(2), t(3), t(4)], [0, 50, 100, 0, 50], 'three pages, then round again');
  // Within one interval the page is stable, so a retry in the same window
  // reads the same page rather than skipping one.
  assert.equal(registryPageOffset(1 * 10 * 60 * 1000 + 59_000, depth), 50);
});

test('a registry depth of one page or less never rotates', () => {
  // The testnet pass reads 50, so its offset must stay at 0 — a rotation
  // there would read past the depth it was given and find nothing.
  const t = (ticks: number) => registryPageOffset(ticks * 10 * 60 * 1000, 50);
  assert.deepEqual([t(0), t(1), t(7)], [0, 0, 0]);
  assert.equal(registryPageOffset(0, 0), 0, 'and a depth of none does not divide by zero');
});
