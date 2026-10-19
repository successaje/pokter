import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SWEEP_BUDGET_MS,
  SWEEP_INTERVAL_MS,
  SWEEP_RUN_BUDGET_MS,
  registryPageOffset,
  staleAlertDue,
  sweepBatch,
  sweepDue,
  sweepRecent,
} from '../src/lib/history/schedule';

const NOW = Date.parse('2026-10-15T13:00:00Z');
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

test('a sweep is due ten minutes after the last one started, or when none ever has', () => {
  assert.equal(sweepDue(minsAgo(9), NOW), false);
  assert.equal(sweepDue(minsAgo(10), NOW), true);
  assert.equal(sweepDue(null, NOW), true);
});

test('pacing from a run start holds the cadence; pacing from its finish does not', () => {
  /*
   * The bug this encodes, measured in production: runs at 12:40:07 and
   * 12:58:25, eighteen minutes apart on a ten-minute schedule.
   *
   * The scheduler checks on a fixed tick. Fed the last *finish*, the age it
   * sees at the next tick is the interval minus however long the run took —
   * always just short of due, so the sweep slips to the tick after, and the
   * cadence doubles. Fed the last *start*, the age is exactly the interval.
   */
  const TICK = 10 * 60_000;
  const RUN = 150_000; // a real run: mainnet at ~12:39:28, testnet at ~12:40:07

  const started = NOW;
  const finished = started + RUN;
  const nextTick = started + TICK;

  const iso = (t: number) => new Date(t).toISOString();

  assert.equal(
    sweepDue(iso(finished), nextTick),
    false,
    'from the finish the tick is short by the run, so nothing sweeps',
  );
  assert.equal(sweepDue(iso(started), nextTick), true, 'from the start it is exactly due');

  // And the tick after that is where a finish-paced schedule actually lands,
  // which is the doubling.
  assert.equal(sweepDue(iso(finished), started + 2 * TICK), true);
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

test('the run budget stays inside the platform ceiling and the tick', () => {
  // Both constraints are stated in the constant's own doc; asserting them
  // here is what stops a later nudge to either number from reintroducing
  // the shape of the 19 October outage — a run with no room to answer in,
  // or two runs sharing one CPU.
  const MAX_DURATION_MS = 300_000; // route: `export const maxDuration = 300`
  assert.ok(
    SWEEP_RUN_BUDGET_MS < MAX_DURATION_MS,
    'a run must finish early enough to report what it did',
  );
  // Runs now start on the interval rather than a run-length after the last
  // one finished, so the budget has to fit inside the interval — and by more
  // than a hair, since the machine also has a site to serve.
  assert.ok(
    SWEEP_RUN_BUDGET_MS * 2 <= SWEEP_INTERVAL_MS,
    'a run must finish well inside the gap before the next one starts',
  );
  // And the probing share must leave the follow-on steps something to use.
  assert.ok(SWEEP_BUDGET_MS * 2 < SWEEP_RUN_BUDGET_MS, 'probing cannot claim the whole run');
});
